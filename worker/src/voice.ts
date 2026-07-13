// VENDORED from app-live/lib/engine/voice.ts — regenerate with: npm run sync:engine. Do not edit here.
// VidRush engine — voiceover (TTS) with real word-level timings.
// Uses ElevenLabs' "with-timestamps" endpoint: it returns the spoken audio plus a
// per-character alignment, which we group into word timings. Those real timings drive
// the storyboard (shot durations = actual spoken durations) and the karaoke captions,
// replacing the character-weighted estimates from cutBeats. Shared with the render
// worker (vendored) so voiceover can run wherever storage lives.

export interface VoiceWord {
  word: string
  start: number
  end: number
}

export interface VoiceResult {
  audioBase64: string
  format: 'mp3'
  words: VoiceWord[]
  durationSec: number
  voiceId: string
}

// A widely-available default ElevenLabs voice ("Rachel"); override per call or via env.
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2'

// Group ElevenLabs' per-character alignment into word timings. A word runs from the
// start time of its first non-space character to the end time of its last one; runs are
// delimited by whitespace characters.
export function groupCharsIntoWords(
  characters: string[],
  starts: number[],
  ends: number[]
): VoiceWord[] {
  const words: VoiceWord[] = []
  let buf = ''
  let wStart = 0
  let wEnd = 0
  let open = false
  const flush = () => {
    if (open && buf.trim()) words.push({ word: buf, start: wStart, end: wEnd })
    buf = ''
    open = false
  }
  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i]
    if (/\s/.test(ch)) {
      flush()
      continue
    }
    if (!open) {
      wStart = starts[i] ?? wEnd
      open = true
    }
    buf += ch
    wEnd = ends[i] ?? wStart
  }
  flush()
  return words
}

interface ElevenAlignment {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

// Generate a voiceover for `text`, returning the mp3 (base64) and word timings.
export async function generateVoiceover(
  text: string,
  opts: {
    apiKey?: string
    voiceId?: string
    modelId?: string
    abortSignal?: AbortSignal
  } = {}
): Promise<VoiceResult> {
  const apiKey = opts.apiKey || process.env.ELEVENLABS_API_KEY || ''
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set')
  const clean = (text || '').trim()
  if (!clean) throw new Error('no text to voice')
  const voiceId = opts.voiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID
  const modelId = opts.modelId || process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ text: clean, model_id: modelId }),
      signal: opts.abortSignal
    }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as {
    audio_base64?: string
    alignment?: ElevenAlignment
    normalized_alignment?: ElevenAlignment
  }
  if (!data.audio_base64) throw new Error('ElevenLabs returned no audio')

  const align = data.alignment || data.normalized_alignment
  const words = align
    ? groupCharsIntoWords(
        align.characters || [],
        align.character_start_times_seconds || [],
        align.character_end_times_seconds || []
      )
    : []
  const durationSec = words.length ? words[words.length - 1].end : 0

  return {
    audioBase64: data.audio_base64,
    format: 'mp3',
    words,
    durationSec: +durationSec.toFixed(2),
    voiceId
  }
}
