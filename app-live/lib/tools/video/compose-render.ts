import { tool } from 'ai'
import { z } from 'zod'

import { renderStoryboard, type RenderShot } from '@/lib/engine/render'

const shotSchema = z.object({
  kind: z.enum(['photo', 'video']),
  src: z
    .string()
    .optional()
    .describe(
      'Local path or http(s) URL of the resolved asset (the vision-verified pick from sourceFootage). Omit to render a clean brand card for this shot.'
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
    .describe('Local path or URL of the voiceover track (wav/mp3)'),
  music: z
    .string()
    .optional()
    .describe('Local path or URL of a background music bed')
})

// Render a storyboard (shots + assets + optional voiceover/music) into a finished MP4
// using the tier-1 FFmpeg pipeline: Ken Burns on stills, crossfades, word-timed karaoke
// captions, ducked audio. Run after cutBeats + sourceFootage have populated the shots.
export function createComposeRenderTool() {
  return tool({
    description:
      'Render a storyboard into a finished MP4. Takes the shots (with resolved footage assets and word-timed captions from cutBeats/sourceFootage) plus an optional voiceover and music bed, and produces video with Ken Burns motion, crossfades, karaoke captions and a ducked audio mix. Shots without an asset render as clean brand cards.',
    inputSchema: composeRenderSchema,
    execute: async input => {
      const shots: RenderShot[] = input.shots.map(s => ({
        kind: s.kind,
        src: s.src,
        start: s.start,
        duration: s.duration,
        narration: s.narration,
        words: s.words
      }))
      const result = await renderStoryboard({
        width: input.width ?? 1280,
        height: input.height ?? 720,
        fps: input.fps ?? 30,
        brand: { channel: input.channel, accent: input.accent },
        shots,
        voice: input.voice,
        music: input.music
      })
      return { state: 'complete' as const, ...result }
    }
  })
}
