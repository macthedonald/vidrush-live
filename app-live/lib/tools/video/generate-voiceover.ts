import { tool } from 'ai'
import { z } from 'zod'

import { kvGetJSON, kvSetJSON } from '@/lib/engine/kv'
import { generateVoiceover, type VoiceWord } from '@/lib/engine/voice'
import type { ScriptHandle } from './write-script'

const voiceoverSchema = z.object({
  scriptId: z
    .string()
    .optional()
    .describe(
      'The scriptId returned by writeScript. ALWAYS prefer this over `script` — it voices the exact script that was already written and approved, with no retyping and no truncation.'
    ),
  script: z
    .string()
    .optional()
    .describe(
      'The full narration script to voice. Only use this when there is no scriptId (e.g. the user pasted their own script).'
    ),
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
      'Generate a spoken voiceover (TTS) for a narration script, with real word-level timings. Pass the scriptId from writeScript — do NOT rewrite the script. Returns a voiceoverId plus the audio URL and duration. Pass the voiceoverId to cutBeats (so shots lock to actual speech) and to composeRender (so it mixes in the narration). Run after writeScript.',
    inputSchema: voiceoverSchema,
    execute: async ({ scriptId, script, voiceId, voiceName }, { abortSignal }) => {
      // Resolve the script by id first. This is what stops the pipeline from looping back
      // to writeScript: the exact approved text is fetched here rather than being carried
      // through the model, where it would be truncated and have to be regenerated.
      let text = (script || '').trim()
      if (scriptId) {
        const handle = await kvGetJSON<ScriptHandle>(`script:${scriptId}`)
        if (handle?.script?.trim()) {
          text = handle.script.trim()
        } else if (!text) {
          throw new Error(
            `No script found for scriptId "${scriptId}" (it may have expired). Ask the user whether to re-use a script they still have, or to write a new one — do not silently rewrite it.`
          )
        }
      }
      if (!text) {
        throw new Error(
          'generateVoiceover needs either a scriptId from writeScript or the script text.'
        )
      }

      // AI33 hosts the audio, so we get a playable URL that Remotion streams in at render
      // time (compose) and the Player preview plays directly.
      const vo = await generateVoiceover(text, { voiceId, abortSignal })
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
