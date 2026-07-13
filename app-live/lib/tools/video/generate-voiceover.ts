import { tool } from 'ai'
import { z } from 'zod'

import { generateVoiceover, type VoiceWord } from '@/lib/engine/voice'
import { kvSetJSON } from '@/lib/engine/kv'

const voiceoverSchema = z.object({
  script: z
    .string()
    .describe('The full narration script to voice (the clean output of writeScript)'),
  voiceId: z
    .string()
    .optional()
    .describe('ElevenLabs voice id (defaults to the configured/house voice)'),
  voiceName: z
    .string()
    .optional()
    .describe('Human-friendly voice name for display, if known')
})

// What we stash in KV under the voiceoverId — too big to thread through the model.
export interface VoiceoverHandle {
  audioUrl?: string
  words: VoiceWord[]
  durationSec: number
  voiceId: string
}

// Generate a voiceover for the script and return a small handle. The audio + word
// timings are produced by ElevenLabs (via the render worker when configured, so the
// mp3 lands in object storage); the bulky word-timings array is stored in KV under
// voiceoverId so cutBeats can lock the storyboard to real speech and composeRender can
// pull the audio URL — without the model ever having to carry that data.
export function createGenerateVoiceoverTool() {
  return tool({
    description:
      'Generate a spoken voiceover (TTS) for a narration script, with real word-level timings. Returns a voiceoverId plus the audio URL and duration. Pass the voiceoverId to cutBeats (so shots lock to actual speech) and to composeRender (so it mixes in the narration). Run after writeScript.',
    inputSchema: voiceoverSchema,
    execute: async ({ script, voiceId, voiceName }, { abortSignal }) => {
      const workerUrl = process.env.RENDER_WORKER_URL
      let handle: VoiceoverHandle

      if (workerUrl) {
        const res = await fetch(`${workerUrl.replace(/\/$/, '')}/voiceover`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(process.env.RENDER_WORKER_TOKEN
              ? { authorization: `Bearer ${process.env.RENDER_WORKER_TOKEN}` }
              : {})
          },
          body: JSON.stringify({ text: script, voiceId }),
          signal: abortSignal
        })
        if (!res.ok) {
          const msg = await res.text().catch(() => '')
          throw new Error(`voiceover worker ${res.status}: ${msg.slice(0, 300)}`)
        }
        const out = await res.json()
        handle = {
          audioUrl: out.audioUrl,
          words: out.words || [],
          durationSec: out.durationSec || 0,
          voiceId: out.voiceId || voiceId || ''
        }
      } else {
        // Dev/local fallback: call ElevenLabs directly. No upload, so there's no audio
        // URL to play/mix — a worker + storage is required for a playable narration.
        const vo = await generateVoiceover(script, { voiceId, abortSignal })
        handle = {
          audioUrl: undefined,
          words: vo.words,
          durationSec: vo.durationSec,
          voiceId: vo.voiceId
        }
      }

      const voiceoverId = `vo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      await kvSetJSON(`voiceover:${voiceoverId}`, handle)

      return {
        state: 'complete' as const,
        voiceoverId,
        audioUrl: handle.audioUrl,
        durationSec: handle.durationSec,
        wordCount: handle.words.length,
        voiceId: handle.voiceId,
        voiceName: voiceName || undefined
      }
    }
  })
}
