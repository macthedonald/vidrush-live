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

  // Collect all toolCallIds that have matching tool-result parts across all messages
  const resolvedToolCallIds = new Set<string>()
  for (const msg of messages) {
    if (msg.parts) {
      for (const part of msg.parts as any[]) {
        if (part.type === 'tool-result' && part.toolCallId) {
          resolvedToolCallIds.add(part.toolCallId)
        }
      }
    }
  }

  const sanitized: UIMessage[] = []

  for (const msg of messages) {
    if (msg.role !== 'assistant' || !msg.parts) {
      sanitized.push(msg)
      continue
    }

    const filteredParts = msg.parts
      .filter((part: any) => {
        // Strip reasoning parts if requested
        if (part.type === 'reasoning' && options?.isOpenAI) {
          return false
        }

        // Strip custom UI-only tool parts
        if (UI_TOOL_TYPES.has(part.type)) {
          return false
        }

        // Strip tool-calls that don't have a corresponding tool-result
        if (
          (part.type === 'tool-call' || part.type === 'tool-invocation') &&
          part.toolCallId &&
          !resolvedToolCallIds.has(part.toolCallId)
        ) {
          return false
        }

        // Strip dangling tool-result without toolCallId
        if (part.type === 'tool-result' && !part.toolCallId) {
          return false
        }

        return true
      })
      .map((part: any) => {
        if (part.type === 'text' && typeof part.text === 'string') {
          const stripped = stripSpecBlocks(part.text)
          return { ...part, text: stripped }
        }
        return part
      })
      // Filter out empty text parts
      .filter((part: any) => {
        if (part.type === 'text') {
          return typeof part.text === 'string' && part.text.trim().length > 0
        }
        return true
      })

    // Fallback if all parts were filtered out (ensure non-empty text)
    if (filteredParts.length === 0) {
      const fallbackText =
        typeof msg.content === 'string' && msg.content.trim()
          ? msg.content.trim()
          : '[Assistant response completed]'
      sanitized.push({
        ...msg,
        parts: [{ type: 'text', text: fallbackText }]
      })
    } else {
      sanitized.push({
        ...msg,
        parts: filteredParts
      })
    }
  }

  return sanitized
}
