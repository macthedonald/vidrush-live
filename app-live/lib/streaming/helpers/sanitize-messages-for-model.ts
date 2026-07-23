import type { UIMessage } from 'ai'
import { stripSpecBlocks } from '@/lib/render/strip-spec-blocks'

const UI_TOOL_TYPES = new Set([
  'tool-search',
  'tool-fetch',
  'tool-askQuestion',
  'tool-writeScript',
  'tool-sourceFootage',
  'tool-cutBeats',
  'tool-listVoices',
  'tool-generateVoiceover',
  'tool-cloneVoice',
  'tool-generateMusic',
  'tool-generateImage',
  'tool-generateThumbnail',
  'tool-learnFromVideo',
  'tool-generateAvatar',
  'tool-composeRender',
  'todoWrite'
])

/**
 * Sanitizes UIMessages before converting to model messages.
 *
 * 1. Strips fenced ```spec blocks from text parts.
 * 2. Strips custom UI tool parts.
 * 3. For assistant messages in previous turns (index < lastUserIndex), strips
 *    dangling tool-call / tool-result parts that lack matching responses in history.
 *    This prevents Anthropic API errors like "tool_use block without matching tool_result"
 *    on follow-up messages.
 * 4. Strips reasoning parts if isOpenAI is true.
 */
export function sanitizeMessagesForModel(
  messages: UIMessage[],
  options?: { isOpenAI?: boolean }
): UIMessage[] {
  if (!messages || messages.length === 0) return []

  const lastUserIndex = messages.findLastIndex(m => m.role === 'user')

  return messages.map((msg, index) => {
    if (msg.role !== 'assistant' || !msg.parts) {
      return msg
    }

    const isPreviousTurn = lastUserIndex >= 0 && index < lastUserIndex

    const filteredParts = msg.parts
      .filter(part => {
        // Strip reasoning parts for OpenAI or previous turns
        if (part.type === 'reasoning') {
          if (options?.isOpenAI || isPreviousTurn) return false
        }

        // Strip custom UI tool parts
        if (UI_TOOL_TYPES.has(part.type)) {
          return false
        }

        // Strip tool call/result parts from previous turns to prevent Anthropic orphan tool_use errors
        if (
          isPreviousTurn &&
          (part.type === 'tool-call' ||
            part.type === 'tool-result' ||
            part.type === 'tool-invocation' ||
            part.type?.startsWith?.('tool-'))
        ) {
          return false
        }

        return true
      })
      .map(part => {
        if (part.type === 'text' && typeof part.text === 'string') {
          const stripped = stripSpecBlocks(part.text)
          if (stripped !== part.text) {
            return { ...part, text: stripped }
          }
        }
        return part
      })

    // If all parts were filtered out, preserve plain text if available
    if (filteredParts.length === 0) {
      return {
        ...msg,
        parts: [{ type: 'text', text: msg.content || '' }]
      }
    }

    return {
      ...msg,
      parts: filteredParts
    }
  })
}
