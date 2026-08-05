import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getCompetitorThumbnails } from '@/lib/engine/competitor-thumbnails'
import {
  createImageTask,
  DEFAULT_THUMBNAIL_MODEL,
  getImageTask
} from '@/lib/engine/image'
import {
  buildThumbnailPrompt,
  MAX_THUMBNAIL_REFS
} from '@/lib/engine/thumbnail-prompt'

export const runtime = 'nodejs'
// Only long enough to upload references and create the tasks. The render itself is not
// awaited here — see the 'generate' case.
export const maxDuration = 60

// POST /api/thumbnail — three actions:
//   { action: 'competitors', channel, limit? } → { thumbnails: CompetitorThumbnail[] }
//   { action: 'generate', concept, titleText?, referenceImageUrls?,
//     competitorImageUrls?, count? } → { tasks: { taskId, model }[], prompt, … }
//   { action: 'status', taskIds } → { results: { taskId, status, imageUrl?, error? }[] }
//
// The studio resolves competitor thumbnails first (so the user can see and deselect
// them before spending a generation), then sends the chosen URLs back with 'generate',
// then polls 'status' until each task resolves.
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

        // Start the renders and hand the task ids back straight away. A 2K
        // gemini-3-pro-image render was measured still running past 549s, and a Vercel
        // function is killed at 300s — so waiting here could only ever produce a gateway
        // timeout, however long we set maxDuration. The browser polls 'status' instead.
        const count = Math.min(Math.max(Number(body.count) || 1, 1), 4)
        const settled = await Promise.allSettled(
          Array.from({ length: count }, () =>
            createImageTask(prompt, {
              model: DEFAULT_THUMBNAIL_MODEL,
              aspectRatio: '16:9',
              referenceImages: refs.length ? refs : undefined
            })
          )
        )

        const tasks = settled
          .filter(
            (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof createImageTask>>> =>
              r.status === 'fulfilled'
          )
          .map(r => ({
            taskId: r.value.taskId,
            model: r.value.model,
            ...(r.value.imageUrl ? { imageUrl: r.value.imageUrl } : {})
          }))

        if (!tasks.length) {
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
          tasks,
          prompt,
          referenceImageUrls: refs,
          failed: settled.length - tasks.length
        })
      }

      case 'status': {
        const taskIds: string[] = (body.taskIds || [])
          .map((t: unknown) => String(t || '').trim())
          .filter(Boolean)
          .slice(0, 4)
        if (!taskIds.length) {
          return NextResponse.json({ error: 'taskIds required' }, { status: 400 })
        }

        const results = await Promise.all(
          taskIds.map(async taskId => {
            try {
              return { taskId, ...(await getImageTask(taskId)) }
            } catch (error) {
              // A thrown poll is not a dead render — report it as busy so the client
              // keeps waiting rather than discarding a task that is still cooking.
              console.warn('[Thumbnail] status poll failed', taskId, error)
              return { taskId, status: 'busy' as const }
            }
          })
        )

        return NextResponse.json({ results })
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
