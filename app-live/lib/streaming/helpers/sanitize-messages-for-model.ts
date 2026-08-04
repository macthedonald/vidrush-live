import type { UIMessage } from 'ai'

import { stripSpecBlocks } from '@/lib/render/strip-spec-blocks'

import { isToolPart, summarizeToolParts } from './summarize-tool-parts'

/**
 * Sanitizes UIMessages before converting to model messages.
 *
 * 1. Strips fenced ```spec blocks from text parts.
 * 2. Replaces custom UI tool parts with a plain-text digest of what they produced, so the
 *    agent still knows which pipeline stages ran and can reuse their ids instead of
 *    starting the video over. The tool blocks themselves never reach the model, so there
 *    is no tool_use to leave without a matching tool_result.
 * 3. For assistant messages in previous turns, strips dangling tool-call / tool-result
 *    parts that lack matching responses in history. This prevents Anthropic API errors
 *    like "tool_use block without matching tool_result" on follow-up messages.
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
    if (msg.role !== 'assistant') {
      const text = typeof (msg as any).content === 'string' ? (msg as any).content : ''
      const parts =
        msg.parts && msg.parts.length > 0
          ? msg.parts
          : [{ type: 'text', text }]
      sanitized.push({
        ...msg,
        parts: parts as any
      })
      continue
    }

    // Condense this turn's tool work into text before the parts are dropped below.
    const toolDigest = summarizeToolParts(msg.parts as unknown[])

    const filteredParts = msg.parts
      .filter((part: any) => {
        // Strip reasoning parts if requested
        if (part.type === 'reasoning' && options?.isOpenAI) {
          return false
        }

        // Strip custom UI-only tool parts — they survive as `toolDigest` text instead.
        if (isToolPart(part)) {
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

    if (toolDigest) {
      filteredParts.push({ type: 'text', text: toolDigest } as any)
    }

    // Fallback if all parts were filtered out (ensure non-empty text)
    if (filteredParts.length === 0) {
      const msgContent = (msg as any).content
      const fallbackText =
        typeof msgContent === 'string' && msgContent.trim()
          ? msgContent.trim()
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
