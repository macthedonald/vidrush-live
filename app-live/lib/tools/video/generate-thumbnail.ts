import { tool } from 'ai'
import { z } from 'zod'

import { DEFAULT_THUMBNAIL_MODEL, generateImage } from '@/lib/engine/image'

const thumbnailSchema = z.object({
  concept: z
    .string()
    .describe(
      'The thumbnail scene/idea — the subject, emotion, setting and visual hook that will make people click. Be concrete and punchy.'
    ),
  titleText: z
    .string()
    .optional()
    .describe(
      'Short bold text to render ON the thumbnail (a few words max). nano-banana-pro renders text crisply — keep it 2–5 impactful words.'
    ),
  referenceImageUrl: z
    .string()
    .optional()
    .describe(
      'Optional reference image URL (a face, subject, product or logo) to feature consistently in the thumbnail.'
    )
})

// Build a click-optimized YouTube thumbnail prompt, then render it with nano-banana-pro
// (Google Gemini 3 Pro Image) via AI33 at 16:9. nano-banana-pro is strong at legible
// overlay text and honoring a reference image.
function buildThumbnailPrompt(concept: string, titleText?: string): string {
  const parts = [
    'YouTube thumbnail, 16:9, ultra high contrast, bold saturated colors, dramatic rim lighting,',
    'sharp focus on the subject, shallow depth of field, punchy and eye-catching for a small preview size.',
    concept.trim()
  ]
  if (titleText?.trim()) {
    parts.push(
      `Render the exact text "${titleText.trim()}" as a large, bold, legible headline with a strong outline/shadow so it pops. Do not misspell it.`
    )
  }
  return parts.join(' ')
}

export function createGenerateThumbnailTool() {
  return tool({
    description:
      'Generate a click-optimized YouTube thumbnail (16:9) with nano-banana-pro (Google Gemini 3 Pro Image, via AI33). Excellent at rendering bold, correctly-spelled overlay text and at honoring a reference image (a face, subject or logo). Returns a hosted image URL.',
    inputSchema: thumbnailSchema,
    execute: async (
      { concept, titleText, referenceImageUrl },
      { abortSignal }
    ) => {
      const img = await generateImage(buildThumbnailPrompt(concept, titleText), {
        model: DEFAULT_THUMBNAIL_MODEL,
        aspectRatio: '16:9',
        referenceImages: referenceImageUrl ? [referenceImageUrl] : undefined,
        abortSignal
      })
      return {
        state: 'complete' as const,
        imageUrl: img.imageUrl,
        model: img.model,
        titleText: titleText || undefined
      }
    }
  })
}
