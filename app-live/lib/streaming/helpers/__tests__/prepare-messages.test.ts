import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createChatWithFirstMessage,
  deleteMessagesFromIndex,
  loadChatUncached,
  upsertMessage
} from '@/lib/actions/chat'
import type { Chat } from '@/lib/db/schema'
import { signFilePartUrls } from '@/lib/storage/r2-client'
import type { UIMessage } from '@/lib/types/ai'

import { prepareMessages } from '../prepare-messages'
import type { StreamContext } from '../types'

// Mock dependencies
vi.mock('@/lib/actions/chat')
vi.mock('@/lib/db/schema', async () => {
  const actual = await vi.importActual('@/lib/db/schema')
  return {
    ...actual,
    generateId: vi.fn(() => 'generated-id-123')
  }
})
vi.mock('@/lib/storage/r2-client', () => ({
  getUserFileObjectKeyPrefix: vi.fn((userId: string) => `${userId}/`),
  signFilePartUrls: vi.fn(async (parts: any[]) => parts)
}))

describe('prepareMessages', () => {
  const userId = 'user-123'
  const chatId = 'chat-123'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('regenerate-message trigger', () => {
    it('should use in-memory messages after deleting assistant message', async () => {
      // Setup: Chat with 4 messages
      const initialChat: Chat & { messages: UIMessage[] } = {
        id: chatId,
        title: 'Test Chat',
        userId,
        visibility: 'private',
        createdAt: new Date(),
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            parts: [{ type: 'text', text: 'Question 1' }]
          },
          {
            id: 'msg-2',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Answer 1' }]
          },
          {
            id: 'msg-3',
            role: 'user',
            parts: [{ type: 'text', text: 'Question 2' }]
          },
          {
            id: 'msg-4',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Answer 2' }]
          }
        ]
      }

      vi.mocked(deleteMessagesFromIndex).mockResolvedValue({
        success: true,
        count: 3
      })

      const context: StreamContext = {
        chatId,
        userId,
        modelId: 'gpt-4',
        trigger: 'regenerate-message',
        messageId: 'msg-2',
        initialChat,
        isNewChat: false
      }

      const result = await prepareMessages(context, null)

      // Verify deleteMessagesFromIndex was called with correct message
      expect(deleteMessagesFromIndex).toHaveBeenCalledWith(
        chatId,
        'msg-2',
        userId
      )

      // Should NOT call loadChat (uses in-memory messages to avoid stale cache)
      expect(loadChatUncached).not.toHaveBeenCalled()

      // Verify only message 1 is returned (correct context for regeneration)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('msg-1')
    })

    it('should use in-memory messages after deleting later assistant message', async () => {
      // Setup: Chat with 6 messages
      const initialChat: Chat & { messages: UIMessage[] } = {
        id: chatId,
        title: 'Test Chat',
        userId,
        visibility: 'private',
        createdAt: new Date(),
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            parts: [{ type: 'text', text: 'Question 1' }]
          },
          {
            id: 'msg-2',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Answer 1' }]
          },
          {
            id: 'msg-3',
            role: 'user',
            parts: [{ type: 'text', text: 'Question 2' }]
          },
          {
            id: 'msg-4',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Answer 2' }]
          },
          {
            id: 'msg-5',
            role: 'user',
            parts: [{ type: 'text', text: 'Question 3' }]
          },
          {
            id: 'msg-6',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Answer 3' }]
          }
        ]
      }

      vi.mocked(deleteMessagesFromIndex).mockResolvedValue({
        success: true,
        count: 3
      })

      const context: StreamContext = {
        chatId,
        userId,
        modelId: 'gpt-4',
        trigger: 'regenerate-message',
        messageId: 'msg-4',
        initialChat,
        isNewChat: false
      }

      const result = await prepareMessages(context, null)

      // Verify correct messages deleted
      expect(deleteMessagesFromIndex).toHaveBeenCalledWith(
        chatId,
        'msg-4',
        userId
      )

      // Should NOT call loadChat (uses in-memory messages to avoid stale cache)
      expect(loadChatUncached).not.toHaveBeenCalled()

      // Verify messages 1-3 are returned (correct context)
      expect(result).toHaveLength(3)
      expect(result[0].id).toBe('msg-1')
      expect(result[1].id).toBe('msg-2')
      expect(result[2].id).toBe('msg-3')
    })

    it('should handle user message edit with in-memory messages', async () => {
      // Setup: Chat with 4 messages
      const initialChat: Chat & { messages: UIMessage[] } = {
        id: chatId,
        title: 'Test Chat',
        userId,
        visibility: 'private',
        createdAt: new Date(),
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            parts: [{ type: 'text', text: 'Question 1' }]
          },
          {
            id: 'msg-2',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Answer 1' }]
          },
          {
            id: 'msg-3',
            role: 'user',
            parts: [{ type: 'text', text: 'Question 2' }]
          },
          {
            id: 'msg-4',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Answer 2' }]
          }
        ]
      }

      const editedMessage: UIMessage = {
        id: 'msg-3',
        role: 'user',
        parts: [{ type: 'text', text: 'Edited Question 2' }]
      }

      vi.mocked(upsertMessage).mockResolvedValue({
        id: 'msg-3',
        chatId,
        role: 'user',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      })
      vi.mocked(deleteMessagesFromIndex).mockResolvedValue({
        success: true,
        count: 1
      })

      const context: StreamContext = {
        chatId,
        userId,
        modelId: 'gpt-4',
        trigger: 'regenerate-message',
        messageId: 'msg-3',
        initialChat,
        isNewChat: false
      }

      const result = await prepareMessages(context, editedMessage)

      // Verify message was updated
      expect(upsertMessage).toHaveBeenCalledWith(chatId, editedMessage, userId)

      // Verify subsequent messages were deleted
      expect(deleteMessagesFromIndex).toHaveBeenCalledWith(
        chatId,
        'msg-4',
        userId
      )

      // Should NOT call loadChat (uses in-memory messages to avoid stale cache)
      expect(loadChatUncached).not.toHaveBeenCalled()

      // Verify updated messages are returned with edited message
      expect(result).toHaveLength(3)
      expect(result[2].parts[0]).toMatchObject({
        type: 'text',
        text: 'Edited Question 2'
      })
    })

    it('should throw error when no messages found in chat', async () => {
      const emptyChat: Chat & { messages: UIMessage[] } = {
        id: chatId,
        title: 'Empty Chat',
        userId,
        visibility: 'private',
        createdAt: new Date(),
        messages: []
      }

      const context: StreamContext = {
        chatId,
        userId,
        modelId: 'gpt-4',
        trigger: 'regenerate-message',
        messageId: 'msg-1',
        initialChat: emptyChat,
        isNewChat: false
      }

      await expect(prepareMessages(context, null)).rejects.toThrow(
        'No messages found'
      )
    })

    it('should use fallback when message not found by ID', async () => {
      const initialChat: Chat & { messages: UIMessage[] } = {
        id: chatId,
        title: 'Test Chat',
        userId,
        visibility: 'private',
        createdAt: new Date(),
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            parts: [{ type: 'text', text: 'Question 1' }]
          },
          {
            id: 'msg-2',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Answer 1' }]
          }
        ]
      }

      vi.mocked(deleteMessagesFromIndex).mockResolvedValue({
        success: true,
        count: 1
      })

      const context: StreamContext = {
        chatId,
        userId,
        modelId: 'gpt-4',
        trigger: 'regenerate-message',
        messageId: 'non-existent-id',
        initialChat,
        isNewChat: false
      }

      const result = await prepareMessages(context, null)

      // Should fallback to last assistant message (msg-2)
      expect(deleteMessagesFromIndex).toHaveBeenCalled()
      // Should NOT call loadChat (uses in-memory messages)
      expect(loadChatUncached).not.toHaveBeenCalled()
      expect(result).toHaveLength(1)
    })
  })

  describe('submit-message trigger', () => {
    it('should create new chat with first message optimistically', async () => {
      const newMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }]
      }

      vi.mocked(createChatWithFirstMessage).mockResolvedValue({
        chat: {
          id: chatId,
          title: 'Untitled',
          userId,
          visibility: 'private',
          createdAt: new Date()
        },
        message: {
          id: 'msg-1',
          chatId,
          role: 'user',
          metadata: {},
          createdAt: new Date(),
          updatedAt: null
        }
      })

      const context: StreamContext = {
        chatId,
        userId,
        modelId: 'gpt-4',
        trigger: 'submit-message',
        messageId: undefined,
        initialChat: null,
        isNewChat: true
      }

      const result = await prepareMessages(context, newMessage)

      // Verify message is returned immediately (optimistic)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('msg-1')

      // Verify persistence happens in background
      expect(context.pendingInitialSave).toBeDefined()
      expect(context.pendingInitialUserMessage).toEqual({
        ...newMessage,
        id: 'msg-1'
      })
      expect(signFilePartUrls).toHaveBeenCalledWith(newMessage.parts, {
        allowedKeyPrefix: 'user-123/'
      })
    })

    it('should append message to existing chat', async () => {
      const existingChat: Chat & { messages: UIMessage[] } = {
        id: chatId,
        title: 'Existing Chat',
        userId,
        visibility: 'private',
        createdAt: new Date(),
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            parts: [{ type: 'text', text: 'First message' }]
          }
        ]
      }

      const newMessage: UIMessage = {
        id: 'msg-2',
        role: 'user',
        parts: [{ type: 'text', text: 'Second message' }]
      }

      vi.mocked(upsertMessage).mockResolvedValue({
        id: 'msg-2',
        chatId,
        role: 'user',
        metadata: {},
        createdAt: new Date(),
        updatedAt: null
      })

      const context: StreamContext = {
        chatId,
        userId,
        modelId: 'gpt-4',
        trigger: 'submit-message',
        messageId: undefined,
        initialChat: existingChat,
        isNewChat: false
      }

      const result = await prepareMessages(context, newMessage)

      // Verify message was saved
      expect(upsertMessage).toHaveBeenCalledWith(chatId, newMessage, userId)

      // Verify both messages are returned
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('msg-1')
      expect(result[1].id).toBe('msg-2')
    })

    // The assistant turn is written in the stream's onFinish, after the request
    // context is gone, so the revalidateTag inside upsertMessage is swallowed and the
    // 60s unstable_cache keeps serving history from before the reply. Reading through
    // that cache hands the model a transcript where its own work never happened and it
    // restarts the pipeline, so this path must never use the cached loader.
    it('reads history through the uncached loader, not the 60s cache', async () => {
      const newMessage: UIMessage = {
        id: 'msg-2',
        role: 'user',
        parts: [{ type: 'text', text: 'keep going' }]
      }

      vi.mocked(loadChatUncached).mockResolvedValue({
        id: chatId,
        title: 'Existing Chat',
        userId,
        visibility: 'private',
        createdAt: new Date(),
        messages: [
          { id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
          {
            id: 'asst-1',
            role: 'assistant',
            parts: [{ type: 'text', text: 'script written' }]
          }
        ]
      } as unknown as Awaited<ReturnType<typeof loadChatUncached>>)

      const context: StreamContext = {
        chatId,
        userId,
        modelId: 'gpt-4',
        trigger: 'submit-message',
        messageId: undefined,
        initialChat: null,
        isNewChat: false
      }

      const result = await prepareMessages(context, newMessage)

      expect(loadChatUncached).toHaveBeenCalledWith(chatId, userId)
      // The assistant's prior work must survive into the next turn.
      expect(result.some(m => m.role === 'assistant')).toBe(true)
    })
    // Answering an askQuestion card resubmits the SAME assistant message, now carrying the
    // tool result. Treating it as a new user turn would mint a fresh id and append a
    // duplicate copy of the assistant's turn on every option the user picked.
    it('updates the assistant turn in place on a tool-result continuation', async () => {
      const assistantWithAnswer: UIMessage = {
        id: 'asst-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-askQuestion',
            toolCallId: 'call-1',
            state: 'output-available',
            input: { question: 'Which style?' },
            output: { selectedOptions: ['Cinematic B-roll'] }
          } as never
        ]
      }

      const existingChat: Chat & { messages: UIMessage[] } = {
        id: chatId,
        title: 'Existing Chat',
        userId,
        visibility: 'private',
        createdAt: new Date(),
        messages: [
          { id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'make a video' }] },
          { id: 'asst-1', role: 'assistant', parts: [] }
        ]
      }

      vi.mocked(upsertMessage).mockResolvedValue({
        id: 'asst-1',
        chatId,
        role: 'assistant',
        metadata: {},
        createdAt: new Date(),
        updatedAt: null
      })

      const context: StreamContext = {
        chatId,
        userId,
        modelId: 'gpt-4',
        trigger: 'submit-message',
        messageId: undefined,
        initialChat: existingChat,
        isNewChat: false
      }

      const result = await prepareMessages(context, assistantWithAnswer)

      // Its own id survives, so the existing row is updated rather than duplicated.
      expect(upsertMessage).toHaveBeenCalledWith(
        chatId,
        expect.objectContaining({ id: 'asst-1', role: 'assistant' }),
        userId
      )
      expect(result).toHaveLength(2)
      expect(result.filter(m => m.id === 'asst-1')).toHaveLength(1)
      // And the answer the user picked is the version that reaches the model.
      expect(result[1].parts).toHaveLength(1)
    })
  })
})
