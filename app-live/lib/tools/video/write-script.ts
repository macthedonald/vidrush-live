import { tool } from 'ai'
import { z } from 'zod'

import { kvSetJSON } from '@/lib/engine/kv'
import { writeVideoScript } from '@/lib/engine/script'

const writeScriptSchema = z.object({
  topic: z.string().describe('The video topic / working title'),
  niche: z
    .string()
    .optional()
    .describe('The channel niche this video belongs to (e.g. "Ancient Rome mysteries")'),
  minutes: z
    .number()
    .min(0.5)
    .max(20)
    .optional()
    .describe('Target video length in minutes (default 5)'),
  language: z
    .string()
    .optional()
    .describe('Narration language (default English)'),
  tone: z
    .string()
    .optional()
    .describe(
      'Optional style directive, e.g. "countdown listicle", "documentary narration", "motivational"'
    ),
  researchNotes: z
    .string()
    .optional()
    .describe(
      'Key facts/angles gathered with the search and fetch tools — ALWAYS research the topic first and pass the distilled findings here so the script is grounded in real facts'
    )
})

/** What we stash in KV under the scriptId so later stages never retype the script. */
export interface ScriptHandle {
  script: string
  brief?: string
  topic?: string
  words?: number
}

// Full narration script + creative brief for a faceless YouTube video.
export function createWriteScriptTool(model: string) {
  return tool({
    description:
      'Write a complete, word-for-word faceless-YouTube narration script (plus the creative brief that guides it). Research the topic with search/fetch FIRST and pass the findings in researchNotes. Returns clean spoken narration in natural paragraphs — no markdown, no stage directions — plus a scriptId. Pass that scriptId to generateVoiceover and cutBeats instead of retyping the script.',
    inputSchema: writeScriptSchema,
    execute: async (input, { abortSignal }) => {
      const result = await writeVideoScript(model, input, abortSignal)

      // Store the script and hand back a short id.
      //
      // Later stages need the script verbatim, but the only record of an earlier turn is
      // the tool-history digest, which truncates long fields. A 5-minute narration does not
      // survive that, so an agent asked to "make the voiceover now" had no complete script
      // to pass — and its way out was to call writeScript again, producing a brand new
      // script on every attempt. With an id the text never has to cross the model at all.
      const scriptId = `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      const handle: ScriptHandle = {
        script: result.script,
        brief: result.brief,
        topic: input.topic,
        words: result.words
      }
      await kvSetJSON(`script:${scriptId}`, handle)

      return { state: 'complete' as const, scriptId, ...result }
    }
  })
}
