// Video understanding for the learn-from-video sub-agent. Reverse-engineers a reference
// YouTube video's structure (hook, phase order, pacing, visual mix, narration devices) so
// the pipeline can make a video in that style.
//
// Two backends, Claude-first per our stack:
//   1. CLAUDE (primary, when a frame-extraction watch service is configured via
//      WATCH_SERVICE_URL): the service returns frames + transcript (it runs the bundled
//      `watch` skill / yt-dlp + ffmpeg, which can't run on Vercel serverless), and Claude
//      reads the frames as images.
//   2. GEMINI (fallback, always available): Gemini reads the YouTube URL directly — no
//      download — via generateContent.
import { generateText } from 'ai'

import { getModel } from '@/lib/utils/registry'

import 'server-only'

export interface VideoAnalysis {
  provider: 'claude' | 'gemini'
  hook?: string
  phases?: { name: string; purpose: string }[]
  pacing?: string
  visualMix?: string
  narrationDevices?: string[]
  summary: string
  /** The full structured object as returned by the model (superset of the above). */
  raw: Record<string, unknown>
}

const ANALYSIS_SYS = `You reverse-engineer YouTube videos for a faceless-content studio. Analyze the reference video and return ONLY JSON with this shape:
{
  "hook": "how the first 5-10s grabs attention",
  "phases": [{"name":"e.g. real footage / commentary over b-roll / graphics","purpose":"what it accomplishes"}],
  "pacing": "cut rhythm and shot length feel",
  "visualMix": "balance of real footage vs graphics vs talking",
  "narrationDevices": ["curiosity loops","retention hooks","..."],
  "summary": "2-3 sentences a scriptwriter can act on to recreate this style"
}`

function parseJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.search(/[[{]/)
  const obj = JSON.parse(start >= 0 ? raw.slice(start) : raw)
  return obj && typeof obj === 'object' ? obj : {}
}

function shape(raw: Record<string, unknown>, provider: 'claude' | 'gemini'): VideoAnalysis {
  return {
    provider,
    hook: raw.hook as string | undefined,
    phases: (raw.phases as VideoAnalysis['phases']) || undefined,
    pacing: raw.pacing as string | undefined,
    visualMix: raw.visualMix as string | undefined,
    narrationDevices: (raw.narrationDevices as string[]) || undefined,
    summary: (raw.summary as string) || 'Analysis complete.',
    raw
  }
}

// --- Claude path (primary, needs a frame-extraction watch service) ---
async function analyzeWithClaude(
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
    signal
  })
  if (!res.ok) throw new Error(`watch service ${res.status}`)
  const { frames, transcript } = (await res.json()) as {
    frames: string[]
    transcript?: string
  }
  if (!frames?.length) throw new Error('watch service returned no frames')

  const { text } = await generateText({
    model: getModel(process.env.LEARN_VIDEO_CLAUDE_MODEL || 'anthropic:claude-3-5-sonnet-latest'),
    system: ANALYSIS_SYS,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Reference video: ${youtubeUrl}${goal ? `\nGoal: ${goal}` : ''}\nTranscript:\n${(transcript || '').slice(0, 12000)}\n\nThe images are sampled frames in order. Analyze the structure.`
          },
          ...frames.slice(0, 20).map(f => ({ type: 'image' as const, image: f }))
        ]
      }
    ]
  })
  return shape(parseJson(text), 'claude')
}

// --- Gemini path (fallback, reads the YouTube URL directly) ---
async function analyzeWithGemini(
  youtubeUrl: string,
  goal: string | undefined,
  signal?: AbortSignal
): Promise<VideoAnalysis> {
  const key =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || ''
  if (!key)
    throw new Error(
      'No video-understanding backend configured (set WATCH_SERVICE_URL for Claude, or GEMINI_API_KEY for the Gemini fallback).'
    )
  const model = process.env.LEARN_VIDEO_GEMINI_MODEL || 'gemini-2.5-flash'
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: ANALYSIS_SYS }] },
        contents: [
          {
            parts: [
              {
                text: `Reference video to analyze.${goal ? ` Goal: ${goal}.` : ''}`
              },
              { file_data: { file_uri: youtubeUrl } }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4000,
          responseMimeType: 'application/json'
        }
      }),
      signal
    }
  )
  const d = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(d?.error?.message || `Gemini ${res.status}`)
  }
  const text =
    d?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || ''
  if (!text) throw new Error('Gemini returned no analysis')
  return shape(parseJson(text), 'gemini')
}

// Analyze a reference video. Claude when the watch service is configured; Gemini otherwise
// (and Gemini as fallback if the Claude path errors).
export async function analyzeVideo(
  youtubeUrl: string,
  opts: { goal?: string; signal?: AbortSignal } = {}
): Promise<VideoAnalysis> {
  if (process.env.WATCH_SERVICE_URL) {
    try {
      return await analyzeWithClaude(youtubeUrl, opts.goal, opts.signal)
    } catch {
      // fall through to Gemini
    }
  }
  return analyzeWithGemini(youtubeUrl, opts.goal, opts.signal)
}
