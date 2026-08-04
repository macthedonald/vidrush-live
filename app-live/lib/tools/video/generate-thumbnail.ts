import { tool } from 'ai'
import { z } from 'zod'

import { getCompetitorThumbnails } from '@/lib/engine/competitor-thumbnails'
import { DEFAULT_THUMBNAIL_MODEL, generateImage } from '@/lib/engine/image'
import {
  buildThumbnailPrompt,
  MAX_THUMBNAIL_REFS
} from '@/lib/engine/thumbnail-prompt'

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
  referenceImageUrls: z
    .array(z.string())
    .optional()
    .describe(
      'Reference image URLs the user supplied (uploaded samples, a face, product, logo, or thumbnails they like). Up to 4 are used.'
    ),
  competitorChannel: z
    .string()
    .optional()
    .describe(
      "A competitor's YouTube channel (@handle, channel URL, UC… id, or channel name). Their top-performing thumbnails are pulled and used as style references."
    ),
  competitorCount: z
    .number()
    .int()
    .min(1)
    .max(4)
    .optional()
    .describe('How many competitor thumbnails to use as references (default 2).')
})

// Thumbnails have a dedicated home at /thumbnails (the Thumbnail Studio), which is the
// better place to iterate on references and compare variants. This tool stays for when
// the user asks for one mid-conversation.
export function createGenerateThumbnailTool() {
  return tool({
    description:
      "Generate a click-optimized YouTube thumbnail (16:9) with nano-banana-pro (Google Gemini 3 Pro Image, via AI33). Excellent at rendering bold, correctly-spelled overlay text and at honoring reference images. References can come from the user (uploaded sample / image URL) and/or from a competitor's channel, whose top-performing thumbnails are fetched automatically. Ask the user which they want before calling. Returns a hosted image URL.",
    inputSchema: thumbnailSchema,
    execute: async (
      {
        concept,
        titleText,
        referenceImageUrls,
        competitorChannel,
        competitorCount
      },
      { abortSignal }
    ) => {
      if (!process.env.AI33_API_KEY) {
        throw new Error(
          'Thumbnail generation is not configured — AI33_API_KEY is missing on the server. Set it (and optionally AI33_THUMBNAIL_MODEL, default nano-banana-pro) in the deployment environment.'
        )
      }

      const userRefs = (referenceImageUrls || [])
        .map(u => (u || '').trim())
        .filter(Boolean)
        .slice(0, MAX_THUMBNAIL_REFS)

      // Competitor scraping is a nice-to-have: if the channel can't be read, still make
      // the thumbnail from the concept rather than failing the whole call.
      let competitorRefs: string[] = []
      let competitorTitles: string[] = []
      let competitorNote: string | undefined
      if (competitorChannel?.trim()) {
        const room = Math.max(0, MAX_THUMBNAIL_REFS - userRefs.length)
        const want = Math.min(competitorCount || 2, room)
        if (want > 0) {
          try {
            const found = await getCompetitorThumbnails(competitorChannel, {
              limit: want,
              signal: abortSignal
            })
            competitorRefs = found.map(f => f.thumbnailUrl)
            competitorTitles = found.map(f => f.title).filter(Boolean)
          } catch (error) {
            competitorNote = `Could not read thumbnails from "${competitorChannel}": ${error instanceof Error ? error.message : String(error)}`
            console.warn('[GenerateThumbnail]', competitorNote)
          }
        } else {
          competitorNote =
            'Competitor thumbnails were skipped — the reference slots were already filled by the supplied images.'
        }
      }

      const refs = [...userRefs, ...competitorRefs]

      const img = await generateImage(
        buildThumbnailPrompt(
          concept,
          titleText,
          userRefs.length,
          competitorRefs.length
        ),
        {
          model: DEFAULT_THUMBNAIL_MODEL,
          aspectRatio: '16:9',
          referenceImages: refs.length ? refs : undefined,
          abortSignal
        }
      )

      return {
        state: 'complete' as const,
        imageUrl: img.imageUrl,
        model: img.model,
        titleText: titleText || undefined,
        referenceImageUrls: refs.length ? refs : undefined,
        ...(competitorChannel?.trim() ? { competitorChannel } : {}),
        ...(competitorTitles.length ? { competitorTitles } : {}),
        ...(competitorNote ? { note: competitorNote } : {})
      }
    }
  })
}
