import { tool } from 'ai'
import { z } from 'zod'

import { kvSetJSON } from '@/lib/engine/kv'
import { analyzeVideo } from '@/lib/engine/video-understanding'

const learnSchema = z.object({
  youtubeUrl: z
    .string()
    .describe('The YouTube video URL to learn from (the reference to reverse-engineer).'),
  goal: z
    .string()
    .optional()
    .describe(
      'Optional: what the user wants to make from it (e.g. "a 3-minute video in this style about X").'
    )
})

// Learn-from-video sub-agent: watch a reference YouTube video and reverse-engineer its
// structure so the pipeline can recreate the style. Gemini does the watching — it ingests
// the YouTube URL natively, so it sees the actual footage and hears the narration. The
// returned template is stashed in KV and echoed to the model so writeScript/cutBeats can
// follow it.
export function createLearnFromVideoTool() {
  return tool({
    description:
      "Watch a reference YouTube video and reverse-engineer its structure (hook, phase order, pacing, visual mix, narration devices) so you can make a new video in that style. Pass a YouTube URL; returns a style template. Use it when the user submits a video to 'learn from' or 'make one like this', then feed the template's findings into writeScript (researchNotes/tone) and cutBeats.",
    inputSchema: learnSchema,
    execute: async ({ youtubeUrl, goal }, { abortSignal }) => {
      const analysis = await analyzeVideo(youtubeUrl, { goal, signal: abortSignal })
      const templateId = `vtpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      await kvSetJSON(`videoTemplate:${templateId}`, { youtubeUrl, ...analysis })
      return {
        state: 'complete' as const,
        templateId,
        provider: analysis.provider,
        method: analysis.method,
        watched: analysis.watched,
        hook: analysis.hook,
        phases: analysis.phases,
        pacing: analysis.pacing,
        visualMix: analysis.visualMix,
        narrationDevices: analysis.narrationDevices,
        summary: analysis.summary,
        // Surfaced so the agent doesn't present a guess as a real viewing.
        ...(analysis.watched
          ? {}
          : {
              note: 'The video could not be opened; this structure is inferred from the URL and general knowledge, not from watching it.'
            })
      }
    }
  })
}
