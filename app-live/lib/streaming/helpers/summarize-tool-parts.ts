// Tool history → plain text, so the agent remembers what it already built.
//
// Persisted UI tool parts cannot be replayed to the model as real tool_use/tool_result
// pairs: they are stored per-tool, the pairs get pruned independently, and Anthropic 400s
// on a tool_use block whose tool_result is missing. The old sanitizer's answer was to
// delete every tool part outright — which meant a follow-up message arrived with no trace
// of the script, voiceover or storyboard that already existed, so the agent restarted the
// whole video pipeline from scratch.
//
// Instead we render completed tool calls into a compact text digest and attach that to the
// assistant message. No tool blocks cross the wire (nothing to orphan), but the ids and
// artifacts survive, which is what "resume where I stopped" actually needs.

/** A UI tool part as persisted by lib/utils/message-mapping (`tool-<name>`). */
interface ToolPartLike {
  type: string
  toolCallId?: string
  state?: string
  input?: unknown
  output?: unknown
  errorText?: string
}

export const TOOL_PART_PREFIX = 'tool-'

export function isToolPart(part: { type?: string }): boolean {
  return (
    typeof part?.type === 'string' &&
    (part.type.startsWith(TOOL_PART_PREFIX) ||
      part.type === 'todoWrite' ||
      part.type === 'todoRead')
  )
}

export function toolNameOf(part: { type: string }): string {
  return part.type.startsWith(TOOL_PART_PREFIX)
    ? part.type.slice(TOOL_PART_PREFIX.length)
    : part.type
}

// Ids and asset handles are the whole point of the digest — the agent has to be able to
// pass voiceoverId to cutBeats, or templateId to writeScript, on a later turn.
const CARRY_KEYS = [
  'scriptId',
  'voiceoverId',
  'templateId',
  'thumbnailId',
  'renderId',
  'avatarId',
  'musicId',
  'imageUrl',
  'videoUrl',
  'audioUrl',
  'thumbnailUrl',
  'model',
  'voiceId',
  'method',
  'provider',
  'watched',
  'totalSeconds',
  'estimatedTimings',
  'format',
  'titleText'
] as const

const MAX_FIELD_CHARS = 400
const MAX_DIGEST_CHARS = 4000

function short(value: unknown, limit = MAX_FIELD_CHARS): string {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value) ?? String(value)
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat
}

// Pull the fields a later pipeline stage needs out of one tool's output. Falls back to a
// truncated JSON blob for tools we don't have a bespoke shape for, so a new tool still
// contributes something rather than vanishing.
function describeOutput(name: string, output: unknown): string {
  if (output == null) return ''
  if (typeof output !== 'object') return short(output)

  const o = output as Record<string, unknown>
  const bits: string[] = []

  for (const key of CARRY_KEYS) {
    if (o[key] !== undefined && o[key] !== null && o[key] !== '') {
      bits.push(`${key}=${short(o[key], 200)}`)
    }
  }

  // Shapes worth spelling out, because the agent reasons over their contents.
  if (Array.isArray(o.shots)) {
    bits.push(`shots=${o.shots.length}`)
  }
  if (typeof o.script === 'string' && o.script.trim()) {
    // Deliberately short. The full text is fetched by scriptId at the point of use, so
    // spending context on a near-complete copy here only crowds out everything else — and
    // a truncated script is exactly what used to push the agent into rewriting it.
    bits.push(`scriptPreview="${short(o.script, 300)}"`)
  }
  if (typeof o.summary === 'string' && o.summary.trim()) {
    bits.push(`summary="${short(o.summary, 600)}"`)
  }
  if (typeof o.hook === 'string' && o.hook.trim()) {
    bits.push(`hook="${short(o.hook, 300)}"`)
  }
  if (Array.isArray(o.results)) {
    bits.push(`results=${o.results.length}`)
  }
  if (Array.isArray(o.assets)) {
    bits.push(`assets=${o.assets.length}`)
  }
  if (Array.isArray(o.referenceImageUrls)) {
    bits.push(`referenceImages=${o.referenceImageUrls.length}`)
  }

  if (!bits.length) return short(output, 600)
  return bits.join(', ')
}

// askQuestion is answered by the user from the client, so its result is a user decision —
// the chosen video style, length, tone. Losing these is what made the agent re-ask (or
// silently re-pick) style on every turn.
function describeQuestion(input: unknown, output: unknown): string {
  const q =
    input && typeof input === 'object'
      ? short((input as Record<string, unknown>).question, 200)
      : ''
  let answer = ''
  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>
    answer = short(o.selectedOption ?? o.value ?? o.input ?? o.answer ?? o, 200)
  } else if (output != null) {
    answer = short(output, 200)
  }
  if (!q && !answer) return ''
  return `asked "${q}" → user answered: ${answer || '(no answer recorded)'}`
}

/**
 * Render an assistant message's completed tool parts into one text digest.
 * Returns an empty string when nothing had a usable result.
 */
export function summarizeToolParts(parts: unknown[]): string {
  const lines: string[] = []

  for (const raw of parts) {
    const part = raw as ToolPartLike
    if (!part?.type || !isToolPart(part)) continue

    const name = toolNameOf(part)

    if (part.state === 'output-error' && part.errorText) {
      lines.push(`- ${name}: FAILED — ${short(part.errorText, 240)}`)
      continue
    }
    // Calls that never produced a result tell the agent nothing it can build on, and
    // replaying them as "in progress" invites a pointless retry.
    if (part.output === undefined || part.output === null) continue

    const detail =
      name === 'askQuestion'
        ? describeQuestion(part.input, part.output)
        : describeOutput(name, part.output)

    if (detail) lines.push(`- ${name}: ${detail}`)
  }

  if (!lines.length) return ''

  let digest = `[Prior pipeline state — work already completed in this conversation. Reuse these ids and artifacts; do not redo these steps. In particular: if a scriptId is listed, the script is ALREADY WRITTEN — pass that scriptId to generateVoiceover/cutBeats. Never call writeScript again unless the user explicitly asks for a different script.]\n${lines.join('\n')}`
  if (digest.length > MAX_DIGEST_CHARS) {
    digest = `${digest.slice(0, MAX_DIGEST_CHARS)}…`
  }
  return digest
}
