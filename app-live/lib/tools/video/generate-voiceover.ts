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
    .describe(
      'AI33 provider-prefixed voice id, e.g. "elevenlabs_21m00Tcm4TlvDq8ikWAM", "minimax_Calm_Woman", or a "clone_…" id (defaults to the configured/house voice)'
    ),
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

// Generate a voiceover for the script and return a small handle. The audio + word timings
// are produced by AI33 (ElevenLabs/MiniMax/Fish/cloned voices), which hosts the mp3 so its
// URL is playable directly (Remotion streams it in at render time). The bulky word-timings
// array is stored in KV under voiceoverId so cutBeats can lock the storyboard to real
// speech and composeRender can pull the audio URL — without the model ever carrying it.
export function createGenerateVoiceoverTool() {
  return tool({
    description:
      'Generate a spoken voiceover (TTS) for a narration script, with real word-level timings. Returns a voiceoverId plus the audio URL and duration. Pass the voiceoverId to cutBeats (so shots lock to actual speech) and to composeRender (so it mixes in the narration). Run after writeScript.',
    inputSchema: voiceoverSchema,
    execute: async ({ script, voiceId, voiceName }, { abortSignal }) => {
      // AI33 hosts the audio, so we get a playable URL that Remotion streams in at render
      // time (compose) and the Player preview plays directly.
      const vo = await generateVoiceover(script, { voiceId, abortSignal })
      const handle: VoiceoverHandle = {
        audioUrl: vo.audioUrl,
        words: vo.words,
        durationSec: vo.durationSec,
        voiceId: vo.voiceId
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
