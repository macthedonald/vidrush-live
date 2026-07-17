// AI helpers for the Niche Finder — sub-niche ideation and per-niche verdicts. Uses the
// app's model registry (Anthropic by default), so keys come from the server environment.
import { generateText } from 'ai'

import { getModel } from '@/lib/utils/registry'

import 'server-only'

const MODEL = process.env.NICHE_AI_MODEL || 'anthropic:claude-sonnet-5'

const SYS_SUBNICHES = `You are a YouTube niche strategist. Given a broad topic, return ONLY a JSON array of 8 specific, faceless-channel-friendly sub-niche search keywords (2-4 words each, English). Favor niches with strong search demand and story potential. Example: ["ancient rome mysteries","medieval castle secrets"]`
const SYS_VERDICT = `You are a YouTube niche analyst. For each niche you receive metrics for, write a 1-2 sentence sharp verdict (monetization potential, content angle, who wins here). Return ONLY JSON: {"<keyword>":"verdict", ...}`

function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.search(/[[{]/)
  return JSON.parse(start >= 0 ? raw.slice(start) : raw)
}

export async function suggestSubNiches(topic: string): Promise<string[]> {
  const { text } = await generateText({
    model: getModel(MODEL),
    system: SYS_SUBNICHES,
    prompt: `Broad topic: ${topic.trim()}`
  })
  const arr = parseJson(text)
  if (!Array.isArray(arr) || !arr.length)
    throw new Error('No suggestions came back — try a broader topic')
  return arr.map(a => String(a).toLowerCase())
}

export async function nicheVerdicts(
  summary: string
): Promise<Record<string, string>> {
  const { text } = await generateText({
    model: getModel(MODEL),
    system: SYS_VERDICT,
    prompt: summary
  })
  const v = parseJson(text)
  return v && typeof v === 'object' ? (v as Record<string, string>) : {}
}
