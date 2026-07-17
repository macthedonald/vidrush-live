import { tool } from 'ai'
import { z } from 'zod'

import { generateMusic } from '@/lib/engine/music'

const musicSchema = z.object({
  prompt: z
    .string()
    .describe(
      'Describe the music bed — mood, genre, tempo, instruments (e.g. "tense cinematic documentary underscore, low strings, slow build")'
    ),
  instrumental: z
    .boolean()
    .optional()
    .describe('Instrumental only (default true — recommended under narration)')
})

// Generate a background music bed (AI33 / Suno). The returned audioUrl plugs into
// composeRender's `music` input as a ducked bed under the voiceover.
export function createGenerateMusicTool() {
  return tool({
    description:
      "Generate a background music bed from a text prompt (via AI33/Suno). Returns an audio URL you can pass as composeRender's `music` input; it is ducked automatically under the voiceover. Instrumental by default.",
    inputSchema: musicSchema,
    execute: async ({ prompt, instrumental }, { abortSignal }) => {
      // Call AI33/Suno directly. AI33 hosts the resulting mp3, so its URL plugs straight
      // into composeRender's `music` input (Remotion streams it in during the render).
      const music = await generateMusic(prompt, { instrumental, abortSignal })
      return {
        state: 'complete' as const,
        audioUrl: music.audioUrl,
        title: music.title,
        durationSec: music.durationSec
      }
    }
  })
}
