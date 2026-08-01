// Kakkao engine — beat segmentation, ported server-side from the studio pipeline.
// Turns a clean narration script into a storyboard skeleton: an ordered list of shots,
// each with its narration, a concrete footage search query + intent, a still/clip hint,
// and estimated word-level timings so the karaoke captions and the FFmpeg xfade chain
// have a timeline to lock to. Real voiceover word timings replace the estimates later;
// until then even/character-weighted estimates keep the whole render coherent.
import { streamObject } from 'ai'
import { z } from 'zod'

import { getModel } from '@/lib/utils/registry'

import type { VoiceWord } from './voice'

const WORDS_PER_SEC = 2.4 // ~144 wpm, matching the script duration presets

export interface BeatWord {
  word: string
  start: number
  end: number
}

export interface BeatShot {
  narration: string
  kind: 'photo' | 'video'
  visualQuery: string
  visualIntent: string
  start: number
  duration: number
  words: BeatWord[]
}

export interface Storyboard {
  topic: string
  format: '16:9' | '9:16' | '1:1'
  width: number
  height: number
  fps: number
  brand: { channel: string; accent: string }
  shots: BeatShot[]
  totalSeconds: number
  estimatedTimings: boolean
}

const DIMS: Record<Storyboard['format'], { width: number; height: number }> = {
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 720, height: 1280 },
  '1:1': { width: 1080, height: 1080 }
}

const SYS_BEATS = `You are a video editor segmenting a finished narration script into SHOTS for a faceless YouTube video.
Return one entry per shot, in reading order, covering the ENTIRE script with no words dropped or added.
Rules:
- Each shot's narration is a short run of the script (roughly one sentence, 4-30 words). Long sentences may split into 2 shots; never merge unrelated ideas.
- Concatenating every "narration" in order MUST reproduce the original script exactly (aside from whitespace).
- Prefer "video" for motion/events/action, "photo" for places, objects, portraits, maps, diagrams.
- visualQuery must be specific and literal enough to match real archival/stock footage — no abstract concepts.`

const shotSchema = z.object({
  narration: z
    .string()
    .describe(
      'The exact consecutive words of the script this shot covers (verbatim, no paraphrase)'
    ),
  kind: z.enum(['photo', 'video']),
  visualQuery: z
    .string()
    .describe(
      "A concrete, specific search phrase to find real b-roll for this shot (e.g. 'Saturn V rocket launch 1969')"
    ),
  visualIntent: z
    .string()
    .describe('One plain sentence describing what the shot must SHOW')
})

type ShotCore = Omit<BeatShot, 'start' | 'duration' | 'words'>

// Segmentation is the step users watch spin. It used to be a single blocking generateText
// with no output cap and no deadline: on a long script the model would run for minutes, and
// any truncation made the trailing JSON unparseable, so the tool threw after the wait. Now
// we stream the array and keep whatever shots have arrived, so a slow or cut-off generation
// degrades to a shorter storyboard instead of a crash.
const BEATS_TIMEOUT_MS = Number(process.env.CUT_BEATS_TIMEOUT_MS || 120_000)

function sanitizeCore(b: unknown, fallbackQuery: string): ShotCore | null {
  const shot = b as Record<string, unknown> | null
  const narration =
    shot && typeof shot.narration === 'string' ? shot.narration.trim() : ''
  if (!narration) return null
  return {
    narration,
    kind: shot!.kind === 'video' ? 'video' : 'photo',
    visualQuery: String(shot!.visualQuery || fallbackQuery || narration).trim(),
    visualIntent: String(shot!.visualIntent || narration).trim()
  }
}

// Distribute a shot's duration across its words, weighting by word length so long
// words get more time — good enough for karaoke fill until real TTS timings arrive.
function timeWords(narration: string, start: number, duration: number): BeatWord[] {
  const tokens = narration.split(/\s+/).filter(Boolean)
  if (!tokens.length) return []
  const weights = tokens.map(w => Math.max(1, w.replace(/[^a-z0-9]/gi, '').length))
  const total = weights.reduce((a, b) => a + b, 0)
  let t = start
  return tokens.map((word, i) => {
    const d = (weights[i] / total) * duration
    const w = { word, start: +t.toFixed(3), end: +(t + d).toFixed(3) }
    t += d
    return w
  })
}

export interface CutBeatsInput {
  script: string
  topic?: string
  format?: Storyboard['format']
  fps?: number
  channel?: string
  accent?: string
  /** Real word timings from a voiceover; when present, shots lock to actual speech. */
  voiceWords?: VoiceWord[]
}

// Bind real voiceover word timings onto semantically-cut shots. The concatenation of
// shot narrations equals the script that was voiced, so we partition the voice words to
// shots by token count. Shot boundaries tile [0, audioEnd] at each shot's first spoken
// word (pauses fold into the preceding shot) so the video length locks to the audio with
// no drift; captions keep the voiceover's absolute word times.
export function bindVoiceTimings(
  shots: Omit<BeatShot, 'start' | 'duration' | 'words'>[],
  voiceWords: VoiceWord[]
): BeatShot[] {
  const perShot: VoiceWord[][] = []
  let wp = 0
  for (const s of shots) {
    const n = s.narration.split(/\s+/).filter(Boolean).length
    perShot.push(voiceWords.slice(wp, wp + n))
    wp += n
  }
  // Any leftover words (LLM dropped/added a token) go to the last shot so nothing is lost.
  if (wp < voiceWords.length && perShot.length) {
    perShot[perShot.length - 1].push(...voiceWords.slice(wp))
  }
  const audioEnd = voiceWords.length ? voiceWords[voiceWords.length - 1].end : 0
  const n = shots.length
  const boundaries: number[] = new Array(n + 1)
  boundaries[0] = 0
  for (let i = 1; i < n; i++) {
    const ws = perShot[i]
    boundaries[i] = ws.length ? ws[0].start : boundaries[i - 1]
  }
  boundaries[n] = audioEnd
  return shots.map((s, i) => {
    const start = +boundaries[i].toFixed(3)
    const duration = +Math.max(0.3, boundaries[i + 1] - boundaries[i]).toFixed(3)
    return { ...s, start, duration, words: perShot[i] }
  })
}

// Segment a script into a timed storyboard skeleton. LLM does the semantic cut; timings
// are estimated from word counts (estimatedTimings=true) until real voiceover is bound.
//
// `onProgress` fires as shots stream in, so callers can show the storyboard filling up
// rather than a spinner that sits on "Segmenting into shots…" for the whole generation.
export async function cutScriptIntoBeats(
  model: string,
  input: CutBeatsInput,
  abortSignal?: AbortSignal,
  onProgress?: (shotsSoFar: number) => void
): Promise<Storyboard> {
  const script = (input.script || '').trim()
  if (!script) throw new Error('no script to segment')
  const format = input.format || '16:9'
  const fps = input.fps || 30
  const { width, height } = DIMS[format]

  // Fold the caller's signal together with a hard deadline so a stalled generation can
  // never hang the tool call indefinitely.
  const deadline = AbortSignal.timeout(BEATS_TIMEOUT_MS)
  const signal = abortSignal
    ? AbortSignal.any([abortSignal, deadline])
    : deadline

  const cores: ShotCore[] = []
  try {
    const { elementStream } = streamObject({
      model: getModel(model),
      output: 'array',
      schema: shotSchema,
      system: SYS_BEATS,
      prompt: `Segment this narration script into shots. Topic: ${input.topic || 'n/a'}.\n\nSCRIPT:\n${script}`,
      abortSignal: signal,
      maxRetries: 1
    })

    // Each element resolves as soon as it is complete, so shots land progressively.
    for await (const element of elementStream) {
      const core = sanitizeCore(element, input.topic || '')
      if (core) {
        cores.push(core)
        onProgress?.(cores.length)
      }
    }
  } catch (error) {
    // A mid-stream failure (timeout, truncation, transport hiccup) keeps the shots we
    // already have. Only a total shutout is fatal.
    if (!cores.length) throw error
    console.warn(
      `[Beats] Segmentation ended early after ${cores.length} shots:`,
      error
    )
  }

  if (!cores.length) throw new Error('beat segmentation produced no shots')

  const useVoice = !!input.voiceWords?.length
  let shots: BeatShot[]
  if (useVoice) {
    shots = bindVoiceTimings(cores, input.voiceWords!)
  } else {
    // Estimate timings from word counts (character-weighted within each shot).
    let cursor = 0
    shots = cores.map(core => {
      const wordCount = core.narration.split(/\s+/).filter(Boolean).length
      const duration = Math.max(1.4, +(wordCount / WORDS_PER_SEC).toFixed(2))
      const start = +cursor.toFixed(3)
      cursor += duration
      return { ...core, start, duration, words: timeWords(core.narration, start, duration) }
    })
  }

  const last = shots[shots.length - 1]
  const totalSeconds = +(last.start + last.duration).toFixed(2)

  return {
    topic: input.topic || '',
    format,
    width,
    height,
    fps,
    brand: {
      channel: input.channel || 'Kakkao',
      accent: input.accent || '#ff2d55'
    },
    shots,
    totalSeconds,
    estimatedTimings: !useVoice
  }
}
