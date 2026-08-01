import {
  consumeStream,
  convertToModelMessages,
  pruneMessages,
  smoothStream
} from 'ai'
import { randomUUID } from 'crypto'
import { Langfuse } from 'langfuse'

import { researcher } from '@/lib/agents/researcher'
import {
  createPublicErrorResponse,
  serializePublicError
} from '@/lib/errors/public-error'
import { isTracingEnabled } from '@/lib/utils/telemetry'

import { loadChat } from '../actions/chat'
import { generateChatTitle } from '../agents/title-generator'
import { claimAnonymousChat } from '../db/actions'
import {
  getMaxAllowedTokens,
  shouldTruncateMessages,
  truncateMessages
} from '../utils/context-window'
import { getTextFromParts } from '../utils/message-utils'
import { perfLog, perfTime } from '../utils/perf-logging'
import { isUsageLogging, logUsage } from '../utils/usage-logging'

import { convertDataPart } from './helpers/convert-data-part'
import { persistStreamResults } from './helpers/persist-stream-results'
import { prepareMessages } from './helpers/prepare-messages'
import { sanitizeMessagesForModel } from './helpers/sanitize-messages-for-model'
import { stripReasoningParts } from './helpers/strip-reasoning-parts'
import { stripSpecFromMessages } from './helpers/strip-spec-from-messages'
import type { StreamContext } from './helpers/types'
import { BaseStreamConfig } from './types'

// Constants
const DEFAULT_CHAT_TITLE = 'Untitled'

export async function createChatStreamResponse(
  config: BaseStreamConfig
): Promise<Response> {
  const {
    message,
    model,
    chatId,
    userId,
    trigger,
    messageId,
    abortSignal,
    isNewChat,
    searchMode,
    relatedEnabled = true
  } = config

  // Verify that chatId is provided
  if (!chatId) {
    return new Response('Chat ID is required', {
      status: 400,
      statusText: 'Bad Request'
    })
  }

  // Skip loading chat for new chats optimization
  let initialChat = null
  if (!isNewChat) {
    const loadChatStart = performance.now()
    // Fetch chat data for authorization check and cache it
    initialChat = await loadChat(chatId, userId)
    perfTime('loadChat completed', loadChatStart)

    // Authorization check: the chat must belong to the user. Chats created
    // before authentication was mandatory are owned by the legacy
    // 'anonymous-user' id; claim those for the current user instead of
    // locking them out of their own history.
    if (initialChat && initialChat.userId !== userId) {
      if (initialChat.userId === 'anonymous-user') {
        await claimAnonymousChat(chatId, userId)
        initialChat = { ...initialChat, userId }
      } else {
        return new Response('You are not allowed to access this chat', {
          status: 403,
          statusText: 'Forbidden'
        })
      }
    }
  } else {
    perfLog('loadChat skipped for new chat')
  }

  // Create parent trace ID for grouping all operations
  let parentTraceId: string | undefined
  let langfuse: Langfuse | undefined

  if (isTracingEnabled()) {
    try {
      parentTraceId = randomUUID()
      langfuse = new Langfuse()

      // Create parent trace with name "research"
      langfuse.trace({
        id: parentTraceId,
        name: 'research',
        metadata: {
          chatId,
          userId,
          modelId: `${model.providerId}:${model.id}`,
          trigger
        }
      })
    } catch (e) {
      console.error('Langfuse tracing error:', e)
    }
  }

  // Create stream context with trace ID
  const context: StreamContext = {
    chatId,
    userId,
    modelId: `${model.providerId}:${model.id}`,
    messageId,
    trigger,
    initialChat,
    abortSignal,
    parentTraceId,
    isNewChat
  }

  // Declare titlePromise in outer scope for onFinish access
  let titlePromise: Promise<string> | undefined

  try {
    // Prepare messages for the model
    const prepareStart = performance.now()
    perfLog(
      `prepareMessages - Invoked: trigger=${trigger}, isNewChat=${isNewChat}`
    )
    const messagesToModel = await prepareMessages(context, message)
    perfTime('prepareMessages completed (stream)', prepareStart)

    // Get the researcher agent with parent trace ID and search mode.
    const researchAgent = researcher({
      model: context.modelId,
      modelConfig: model,
      parentTraceId,
      searchMode,
      relatedEnabled
    })

    const isOpenAI = context.modelId.startsWith('openai:')
    const messagesToConvert = sanitizeMessagesForModel(messagesToModel, { isOpenAI })

    // Convert to model messages and apply context window management
    let modelMessages = await convertToModelMessages(messagesToConvert, {
      convertDataPart
    })

    // Prune messages to reduce token usage while keeping recent context
    if (modelMessages.length > 1) {
      modelMessages = pruneMessages({
        messages: modelMessages,
        reasoning: 'before-last-message',
        toolCalls: 'before-last-2-messages',
        emptyMessages: 'keep'
      })
    }

    if (shouldTruncateMessages(modelMessages, model)) {
      const maxTokens = getMaxAllowedTokens(model)
      const originalCount = modelMessages.length
      modelMessages = truncateMessages(modelMessages, maxTokens, model.id)

      if (process.env.NODE_ENV === 'development') {
        console.log(
          `Context window limit reached. Truncating from ${originalCount} to ${modelMessages.length} messages`
        )
      }
    }

    // Start title generation in parallel if it's a new chat
    if (!initialChat && message) {
      const userContent = getTextFromParts(message.parts)
      titlePromise = generateChatTitle({
        userMessageContent: userContent,
        modelId: context.modelId,
        abortSignal,
        parentTraceId
      }).catch(error => {
        console.error('Error generating title:', error)
        return DEFAULT_CHAT_TITLE
      })
    }

    const llmStart = performance.now()
    perfLog(
      `researchAgent.stream - Start: model=${context.modelId}, searchMode=${searchMode}`
    )
    const result = await researchAgent.stream({
      messages: modelMessages,
      abortSignal,
      // Emit word-by-word on a short tick instead of forwarding raw provider chunks.
      // AgentRouter delivers text in large bursts; without this the UI sits still and
      // then paints a paragraph at once, which reads as a stall.
      experimental_transform: smoothStream({ delayInMs: 10, chunking: 'word' }),
      ...(isUsageLogging() && {
        onStepFinish: step => {
          logUsage(
            { scope: 'step', modelId: context.modelId },
            step.usage,
            step.providerMetadata
          )
        }
      })
    })

    // Log the session-total usage once the stream settles (does not block the
    // response; consumeStream above already drives it to completion).
    if (isUsageLogging()) {
      Promise.resolve(result.totalUsage)
        .then(usage =>
          logUsage({ scope: 'total', modelId: context.modelId }, usage)
        )
        .catch(() => {})
    }

    const response = result.toUIMessageStreamResponse({
      messageMetadata: ({ part }) => {
        if (part.type === 'start') {
          return {
            traceId: parentTraceId,
            searchMode,
            modelId: context.modelId
          }
        }
      },
      onFinish: async ({ responseMessage, isAborted }) => {
        try {
          perfTime('researchAgent.stream completed', llmStart)
          if (isAborted || !responseMessage) return

          // Persist stream results to database
          await persistStreamResults(
            responseMessage,
            chatId,
            userId,
            titlePromise,
            parentTraceId,
            searchMode,
            context.modelId,
            context.pendingInitialSave,
            context.pendingInitialUserMessage
          )
        } finally {
          if (langfuse) {
            await langfuse.flushAsync()
          }
        }
      },
      onError: (error: unknown) => {
        console.error('Stream response error:', error)
        return serializePublicError(error)
      }
    })

    response.headers.set('Content-Type', 'text/event-stream; charset=utf-8')
    response.headers.set('Cache-Control', 'no-cache, no-transform, private')
    response.headers.set('X-Accel-Buffering', 'no')
    response.headers.set('Connection', 'keep-alive')

    return response
  } catch (error) {
    if (langfuse) {
      await langfuse.flushAsync()
    }
    console.error('Stream execution error:', error)
    return createPublicErrorResponse(error, {
      status: 500,
      statusText: 'Internal Server Error'
    })
  }
}
