import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getCompetitorThumbnails } from '@/lib/engine/competitor-thumbnails'
import { DEFAULT_THUMBNAIL_MODEL, generateImage } from '@/lib/engine/image'
import {
  buildThumbnailPrompt,
  MAX_THUMBNAIL_REFS
} from '@/lib/engine/thumbnail-prompt'

export const runtime = 'nodejs'
// nano-banana-pro renders take well past the default budget; the engine polls AI33.
export const maxDuration = 300

// POST /api/thumbnail — two actions:
//   { action: 'competitors', channel, limit? } → { thumbnails: CompetitorThumbnail[] }
//   { action: 'generate', concept, titleText?, referenceImageUrls?,
//     competitorImageUrls?, count? } → { images: { imageUrl, model }[] }
//
// The studio resolves competitor thumbnails first (so the user can see and deselect
// them before spending a generation), then sends the chosen URLs back with 'generate'.
export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  try {
    switch (body.action) {
      case 'competitors': {
        const channel = String(body.channel || '').trim()
        if (!channel) {
          return NextResponse.json(
            { error: 'channel required' },
            { status: 400 }
          )
        }
        const thumbnails = await getCompetitorThumbnails(channel, {
          limit: Math.min(Number(body.limit) || 6, 10)
        })
        return NextResponse.json({ thumbnails })
      }

      case 'generate': {
        if (!process.env.AI33_API_KEY) {
          return NextResponse.json(
            {
              error:
                'Thumbnail generation is not configured — AI33_API_KEY is missing on the server.'
            },
            { status: 503 }
          )
        }

        const concept = String(body.concept || '').trim()
        if (!concept) {
          return NextResponse.json(
            { error: 'concept required' },
            { status: 400 }
          )
        }

        const titleText = String(body.titleText || '').trim() || undefined
        const userRefs: string[] = (body.referenceImageUrls || [])
          .map((u: unknown) => String(u || '').trim())
          .filter(Boolean)
          .slice(0, MAX_THUMBNAIL_REFS)
        const competitorRefs: string[] = (body.competitorImageUrls || [])
          .map((u: unknown) => String(u || '').trim())
          .filter(Boolean)
          .slice(0, Math.max(0, MAX_THUMBNAIL_REFS - userRefs.length))

        const prompt = buildThumbnailPrompt(
          concept,
          titleText,
          userRefs.length,
          competitorRefs.length
        )
        const refs = [...userRefs, ...competitorRefs]

        // A studio session is about comparing options, so render a small batch. They go
        // in parallel — each is an independent AI33 task — and one failure doesn't void
        // the others.
        const count = Math.min(Math.max(Number(body.count) || 1, 1), 4)
        const settled = await Promise.allSettled(
          Array.from({ length: count }, () =>
            generateImage(prompt, {
              model: DEFAULT_THUMBNAIL_MODEL,
              aspectRatio: '16:9',
              referenceImages: refs.length ? refs : undefined
            })
          )
        )

        const images = settled
          .filter(
            (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof generateImage>>> =>
              r.status === 'fulfilled'
          )
          .map(r => ({ imageUrl: r.value.imageUrl, model: r.value.model }))

        if (!images.length) {
          const reason = settled.find(r => r.status === 'rejected') as
            | PromiseRejectedResult
            | undefined
          // Name the model in the failure. An upstream "Invalid model_id" is
          // indistinguishable from a prompt or key problem otherwise, and the id can come
          // from AI33_THUMBNAIL_MODEL rather than the code default.
          const detail =
            reason?.reason instanceof Error
              ? reason.reason.message
              : 'thumbnail generation failed'
          throw new Error(`${detail} (model=${DEFAULT_THUMBNAIL_MODEL})`)
        }

        return NextResponse.json({
          images,
          prompt,
          referenceImageUrls: refs,
          failed: settled.length - images.length
        })
      }

      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'thumbnail request failed' },
      { status: 500 }
    )
  }
}
