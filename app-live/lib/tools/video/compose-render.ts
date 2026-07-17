import { tool } from 'ai'
import { z } from 'zod'

import { kvGetJSON } from '@/lib/engine/kv'
import {
  isLambdaConfigured,
  renderStoryboardOnLambda
} from '@/lib/remotion/lambda'

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

// Render a storyboard (shots + assets + optional voiceover/music) into a finished MP4 with
// Remotion. The SAME storyboard input drives the in-chat Remotion Player preview, so what
// the user previews is exactly what Lambda renders. Run after cutBeats + sourceFootage
// have populated the shots.
export function createComposeRenderTool() {
  return tool({
    description:
      'Assemble the storyboard into a Remotion composition and render it to a finished MP4 on Remotion Lambda. Takes the shots (with resolved footage assets and word-timed captions from cutBeats/sourceFootage) plus an optional voiceover and music bed. The returned storyboard also powers an interactive, scrubbable preview in the chat — the same composition that Lambda renders — so preview and final video match exactly. Shots without an asset render as clean brand cards.',
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
      const base = {
        state: 'complete' as const,
        inputProps,
        totalSeconds,
        shots: inputProps.shots.length,
        hadVoice: !!inputProps.voice,
        hadMusic: !!inputProps.music,
        fallbacks
      }

      // Production path: render on Remotion Lambda and return the MP4 URL.
      if (isLambdaConfigured()) {
        const out = await renderStoryboardOnLambda(inputProps)
        return { ...base, videoUrl: out.url as string | undefined }
      }

      // Lambda not configured: still return the storyboard so the chat can render the
      // interactive Remotion preview. The final MP4 URL is produced once Lambda is set up
      // (see docs/REMOTION_LAMBDA.md).
      return {
        ...base,
        videoUrl: undefined as string | undefined,
        needsLambda: true as const
      }
    }
  })
}
