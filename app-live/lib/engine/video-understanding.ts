// Video understanding for the learn-from-video sub-agent. Reverse-engineers a reference
// YouTube video's structure (hook, phase order, pacing, visual mix, narration devices) so
// the pipeline can make a video in that style.
//
// Gemini-only, by design. Gemini ingests a YouTube URL natively — the model actually
// watches the footage and the audio — so there is no download step and no frame shuttling
// on the happy path. Three tiers, best first:
//   1. VIDEO   — the canonical YouTube URL is handed to Gemini as a file part. Real vision.
//   2. FRAMES  — if the URL isn't one Gemini can fetch (or it refuses), and a watch service
//                is configured, that service returns sampled JPEG frames + a transcript and
//                Gemini reads those as images. Still real vision, just pre-extracted.
//   3. METADATA— last resort: Gemini reasons from the URL/goal alone. Clearly marked as
//                not-watched so callers don't mistake it for an actual viewing.
//
// Note: this module deliberately does NOT go through `@/lib/utils/registry`. getModel()
// rewrites every model id onto AgentRouter/Claude, which cannot see video and 400s on
// image parts — that was the original crash. We construct the Google provider directly.
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateObject } from 'ai'
import { z } from 'zod'

/** How the analysis was produced — `metadata` means the model never saw the footage. */
export type AnalysisMethod = 'video' | 'frames' | 'metadata'

export interface VideoAnalysis {
  provider: 'gemini'
  method: AnalysisMethod
  /** True when the model actually saw the footage (video or extracted frames). */
  watched: boolean
  hook?: string
  phases?: { name: string; purpose: string }[]
  pacing?: string
  visualMix?: string
  narrationDevices?: string[]
  summary: string
  /** The full structured object as returned by the model (superset of the above). */
  raw: Record<string, unknown>
}

const ANALYSIS_SYS = `You reverse-engineer YouTube videos for a faceless-content studio.
Watch the reference video and describe how it is built, so a scriptwriter and an editor can
recreate its style on a different topic. Be concrete and specific — cite what actually happens
on screen and in the narration rather than generic advice.`

const analysisSchema = z.object({
  hook: z.string().describe('How the first 5-10s grabs attention'),
  phases: z
    .array(
      z.object({
        name: z
          .string()
          .describe('e.g. real footage / commentary over b-roll / graphics'),
        purpose: z.string().describe('What this phase accomplishes')
      })
    )
    .describe('The phases of the video, in order'),
  pacing: z.string().describe('Cut rhythm and shot-length feel'),
  visualMix: z.string().describe('Balance of real footage vs graphics vs talking'),
  narrationDevices: z
    .array(z.string())
    .describe('e.g. curiosity loops, retention hooks, callbacks'),
  summary: z
    .string()
    .describe('2-3 sentences a scriptwriter can act on to recreate this style')
})

type Analysis = z.infer<typeof analysisSchema>

// --- Provider ---------------------------------------------------------------

function geminiApiKey(): string {
  return (
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || ''
  )
}

function geminiModel() {
  const apiKey = geminiApiKey()
  if (!apiKey) {
    throw new Error(
      'Gemini is not configured — set GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY) to watch reference videos.'
    )
  }
  const google = createGoogleGenerativeAI({ apiKey })
  return google(process.env.LEARN_VIDEO_GEMINI_MODEL || 'gemini-2.5-flash')
}

// --- URL handling -----------------------------------------------------------

const YT_ID = /^[\w-]{11}$/

// Gemini only accepts YouTube links in the canonical `watch?v=` (or `youtu.be/`) shape —
// @ai-sdk/google matches those against a regex to decide whether to pass the URL through
// as fileData or to download the bytes itself. A /shorts/, /embed/ or m.youtube.com link
// fails that match, so the SDK would try to fetch the page and inline it, which stalls and
// then blows up. Normalising up front keeps us on the pass-through path.
export function canonicalYouTubeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim())
    const host = u.hostname.replace(/^(?:www|m|music)\./, '')
    let id: string | null = null

    if (host === 'youtu.be') {
      id = u.pathname.slice(1).split('/')[0] || null
    } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') {
        id = u.searchParams.get('v')
      } else {
        const m = u.pathname.match(/^\/(?:shorts|embed|v|live)\/([\w-]+)/)
        id = m ? m[1] : null
      }
    }

    return id && YT_ID.test(id) ? `https://www.youtube.com/watch?v=${id}` : null
  } catch {
    return null
  }
}

// --- Helpers ----------------------------------------------------------------

// A hung analysis is worse than a failed one: the tool call never settles and the UI spins
// forever. Every tier gets a hard ceiling, folded together with the caller's abort signal.
function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

const VIDEO_TIMEOUT_MS = Number(process.env.LEARN_VIDEO_TIMEOUT_MS || 180_000)
const FRAMES_TIMEOUT_MS = 120_000
const METADATA_TIMEOUT_MS = 60_000

function shape(raw: Analysis, method: AnalysisMethod): VideoAnalysis {
  return {
    provider: 'gemini',
    method,
    watched: method !== 'metadata',
    hook: raw.hook,
    phases: raw.phases,
    pacing: raw.pacing,
    visualMix: raw.visualMix,
    narrationDevices: raw.narrationDevices,
    summary: raw.summary || 'Analysis complete.',
    raw: raw as unknown as Record<string, unknown>
  }
}

function briefFor(youtubeUrl: string, goal: string | undefined): string {
  return `Reference video: ${youtubeUrl}${goal ? `\nWhat we want to make from it: ${goal}` : ''}`
}

// --- Tier 1: native Gemini video understanding ------------------------------

async function analyzeWithGeminiVideo(
  canonicalUrl: string,
  goal: string | undefined,
  signal?: AbortSignal
): Promise<VideoAnalysis> {
  const { object } = await generateObject({
    model: geminiModel(),
    schema: analysisSchema,
    system: ANALYSIS_SYS,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `${briefFor(canonicalUrl, goal)}\n\nWatch the attached video end to end and reverse-engineer how it is constructed.`
          },
          {
            type: 'file',
            data: new URL(canonicalUrl),
            mediaType: 'video/mp4'
          }
        ]
      }
    ],
    abortSignal: withTimeout(signal, VIDEO_TIMEOUT_MS),
    maxRetries: 1
  })
  return shape(object, 'video')
}

// --- Tier 2: watch-service frames, read by Gemini ---------------------------

async function analyzeWithFrames(
  youtubeUrl: string,
  goal: string | undefined,
  signal?: AbortSignal
): Promise<VideoAnalysis> {
  const svc = process.env.WATCH_SERVICE_URL!
  const res = await fetch(`${svc.replace(/\/$/, '')}/watch`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.WATCH_SERVICE_TOKEN
        ? { authorization: `Bearer ${process.env.WATCH_SERVICE_TOKEN}` }
        : {})
    },
    body: JSON.stringify({ url: youtubeUrl, detail: 'efficient' }),
    signal: withTimeout(signal, FRAMES_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`watch service ${res.status}`)
  const { frames, transcript } = (await res.json()) as {
    frames: string[]
    transcript?: string
  }
  if (!frames?.length) throw new Error('watch service returned no frames')

  const { object } = await generateObject({
    model: geminiModel(),
    schema: analysisSchema,
    system: ANALYSIS_SYS,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `${briefFor(youtubeUrl, goal)}\n\nTranscript:\n${(transcript || '(none available)').slice(0, 12000)}\n\nThe images are frames sampled in chronological order. Reverse-engineer how the video is constructed.`
          },
          ...frames
            .slice(0, 20)
            .map(f => ({ type: 'image' as const, image: f }))
        ]
      }
    ],
    abortSignal: withTimeout(signal, FRAMES_TIMEOUT_MS),
    maxRetries: 1
  })
  return shape(object, 'frames')
}

// --- Tier 3: metadata only --------------------------------------------------

async function analyzeFromMetadata(
  youtubeUrl: string,
  goal: string | undefined,
  signal?: AbortSignal
): Promise<VideoAnalysis> {
  const { object } = await generateObject({
    model: geminiModel(),
    schema: analysisSchema,
    system: ANALYSIS_SYS,
    prompt: `${briefFor(youtubeUrl, goal)}\n\nYou could NOT open this video. Using only the URL and whatever you know about this kind of content, describe the most likely structure for a video like this. Keep it useful but do not invent specific on-screen details you cannot know.`,
    abortSignal: withTimeout(signal, METADATA_TIMEOUT_MS),
    maxRetries: 1
  })
  return shape(object, 'metadata')
}

// --- Entry point ------------------------------------------------------------

// Analyze a reference video. Gemini watches it natively when the URL is a YouTube link;
// otherwise we fall back to pre-extracted frames, then to metadata-only reasoning.
export async function analyzeVideo(
  youtubeUrl: string,
  opts: { goal?: string; signal?: AbortSignal } = {}
): Promise<VideoAnalysis> {
  const { goal, signal } = opts
  const canonical = canonicalYouTubeUrl(youtubeUrl)

  if (canonical) {
    try {
      return await analyzeWithGeminiVideo(canonical, goal, signal)
    } catch (error) {
      if (signal?.aborted) throw error
      console.warn(
        '[VideoUnderstanding] Gemini native video pass failed, trying frames:',
        error
      )
    }
  } else {
    console.warn(
      `[VideoUnderstanding] ${youtubeUrl} is not a YouTube URL Gemini can open directly.`
    )
  }

  if (process.env.WATCH_SERVICE_URL) {
    try {
      return await analyzeWithFrames(youtubeUrl, goal, signal)
    } catch (error) {
      if (signal?.aborted) throw error
      console.warn(
        '[VideoUnderstanding] Frame extraction failed, falling back to metadata:',
        error
      )
    }
  }

  return analyzeFromMetadata(youtubeUrl, goal, signal)
}
