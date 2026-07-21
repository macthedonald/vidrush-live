// Canonical Remotion storyboard input — the single source of truth shared by the
// composition (remotion/Storyboard.tsx), the render tool (lib/tools/video/compose-render.ts),
// the Lambda wrapper (lib/remotion/lambda.ts) and the in-chat Player preview
// (components/remotion-preview.tsx). Everything that produces or consumes a storyboard
// speaks this shape, so preview and final render are guaranteed to match.
import { z } from 'zod'

/** Crossfade length between shots, in seconds — matches the studio's 0.18–0.25s. */
export const FADE_SECONDS = 0.25

export const wordSchema = z.object({
  word: z.string(),
  /** Start time in seconds on the global timeline. */
  start: z.number(),
  /** End time in seconds on the global timeline. */
  end: z.number()
})

export const shotSchema = z.object({
  kind: z.enum(['photo', 'video', 'avatar', 'a-roll']),
  /**
   * Public http(s) URL of the resolved asset (the vision-verified pick from
   * sourceFootage). Omit to render a clean brand card for this shot. Lambda cannot
   * read local file paths, so only URLs are valid in production.
   */
  src: z.string().optional(),
  /** Shot start time in seconds on the global timeline (Σ of prior shot durations). */
  start: z.number(),
  /** Shot duration in seconds. */
  duration: z.number(),
  narration: z.string().optional(),
  /** Word-level caption timings (from cutBeats / the voiceover). */
  words: z.array(wordSchema).optional()
})

export const brandSchema = z.object({
  channel: z.string().optional(),
  /** Accent color #rrggbb for captions and fallback cards. */
  accent: z.string().default('#ff2d55')
})

export const storyboardInputSchema = z.object({
  width: z.number().default(1280),
  height: z.number().default(720),
  fps: z.number().default(30),
  brand: brandSchema.default({ accent: '#ff2d55' }),
  shots: z.array(shotSchema).min(1),
  /** Public URL of the voiceover track (wav/mp3). Optional. */
  voice: z.string().optional(),
  /** Public URL of a background music bed. Optional. */
  music: z.string().optional()
})

export type CaptionWord = z.infer<typeof wordSchema>
export type Shot = z.infer<typeof shotSchema>
export type Brand = z.infer<typeof brandSchema>
export type StoryboardInput = z.infer<typeof storyboardInputSchema>

/** Total timeline length in seconds — last shot's start + duration (locks to the VO). */
export function totalSeconds(input: Pick<StoryboardInput, 'shots'>): number {
  if (!input.shots.length) return 0
  const last = input.shots[input.shots.length - 1]
  return last.start + last.duration
}

/** Composition length in frames, derived from the shots and fps. */
export function durationInFrames(
  input: Pick<StoryboardInput, 'shots' | 'fps'>
): number {
  const fps = input.fps || 30
  return Math.max(1, Math.ceil(totalSeconds(input) * fps))
}
