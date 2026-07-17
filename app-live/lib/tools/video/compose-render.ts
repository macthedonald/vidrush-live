import { tool } from 'ai'
import { z } from 'zod'

import { kvGetJSON, kvSetJSON } from '@/lib/engine/kv'
import { isLambdaConfigured } from '@/lib/remotion/lambda'

import type { VoiceoverHandle } from './generate-voiceover'

import { type StoryboardInput, storyboardInputSchema } from '@/remotion/schema'

const shotSchema = z.object({
  kind: z.enum(['photo', 'video']),
  src: z
    .string()
    .optional()
    .describe(
      'Public http(s) URL of the resolved asset (the vision-verified pick from sourceFootage). Omit to render a clean brand card for this shot. Local file paths are not supported — Lambda can only read URLs.'
    ),
  start: z.number().describe('Shot start time in seconds'),
  duration: z.number().describe('Shot duration in seconds'),
  narration: z.string().optional(),
  words: z
    .array(
      z.object({
        word: z.string(),
        start: z.number(),
        end: z.number()
      })
    )
    .optional()
    .describe('Word-level caption timings (from cutBeats)')
})

const composeRenderSchema = z.object({
  width: z.number().optional().describe('Frame width (default 1280)'),
  height: z.number().optional().describe('Frame height (default 720)'),
  fps: z.number().optional().describe('Frames per second (default 30)'),
  accent: z
    .string()
    .optional()
    .describe('Brand accent color #rrggbb for captions and fallback cards'),
  channel: z.string().optional(),
  shots: z
    .array(shotSchema)
    .min(1)
    .describe('The storyboard shots with resolved assets and timings'),
  voice: z
    .string()
    .optional()
    .describe('Public URL of the voiceover track (wav/mp3)'),
  voiceoverId: z
    .string()
    .optional()
    .describe(
      'Voiceover handle from generateVoiceover — its audio is mixed in automatically (preferred over passing voice directly)'
    ),
  music: z.string().optional().describe('Public URL of a background music bed')
})

// Assemble a storyboard (shots + assets + optional voiceover/music) into a Remotion
// composition and PUBLISH it to the Studio. The SAME storyboard drives the in-chat preview
// and the /studio/[id] canvas; the user opens the Studio, sees the full Remotion canvas, and
// clicks Render to run Remotion Lambda. Run after cutBeats + sourceFootage populate the shots.
export function createComposeRenderTool() {
  return tool({
    description:
      'Assemble the storyboard into a Remotion composition and open it in the Kakkao Studio. Takes the shots (with resolved footage assets and word-timed captions from cutBeats/sourceFootage) plus an optional voiceover and music bed. Returns a Studio link (/studio/[id]) where the user sees the full Remotion canvas and clicks Render to produce the MP4 on Remotion Lambda; the same storyboard also powers an interactive preview inline in the chat. Shots without an asset render as clean brand cards.',
    inputSchema: composeRenderSchema,
    execute: async input => {
      // Resolve the voiceover: an explicit `voice` URL wins; otherwise pull the audio URL
      // from the voiceover handle so the agent only threads the small id.
      let voice = input.voice
      if (!voice && input.voiceoverId) {
        const handle = await kvGetJSON<VoiceoverHandle>(
          `voiceover:${input.voiceoverId}`
        )
        voice = handle?.audioUrl
      }

      // Build the canonical Remotion storyboard input — the single shape the preview and
      // the Lambda render both consume. Zod fills defaults (dimensions, accent).
      const inputProps: StoryboardInput = storyboardInputSchema.parse({
        width: input.width ?? 1280,
        height: input.height ?? 720,
        fps: input.fps ?? 30,
        brand: { channel: input.channel, accent: input.accent ?? '#ff2d55' },
        shots: input.shots.map(s => ({
          kind: s.kind,
          src: s.src,
          start: s.start,
          duration: s.duration,
          narration: s.narration,
          words: s.words
        })),
        voice,
        music: input.music
      })

      const last = inputProps.shots[inputProps.shots.length - 1]
      const totalSeconds = +(last.start + last.duration).toFixed(2)
      const fallbacks = inputProps.shots.filter(s => !s.src).length

      // Publish the storyboard to KV so the Studio page (/studio/[id]) can load it and the
      // user can render it on Lambda from there.
      const studioId = `sb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      await kvSetJSON(`storyboard:${studioId}`, inputProps)

      return {
        state: 'complete' as const,
        studioId,
        studioPath: `/studio/${studioId}`,
        inputProps,
        totalSeconds,
        shots: inputProps.shots.length,
        hadVoice: !!inputProps.voice,
        hadMusic: !!inputProps.music,
        fallbacks,
        lambdaReady: isLambdaConfigured()
      }
    }
  })
}
