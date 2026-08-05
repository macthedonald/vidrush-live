import { beforeEach, describe, expect, it, vi } from 'vitest'

// The pipeline stages resolve the script by id through KV, so that is what gets stubbed.
const kvGetJSON = vi.hoisted(() => vi.fn())
const kvSetJSON = vi.hoisted(() => vi.fn())
vi.mock('@/lib/engine/kv', () => ({ kvGetJSON, kvSetJSON }))

const generateVoiceoverEngine = vi.hoisted(() => vi.fn())
vi.mock('@/lib/engine/voice', () => ({ generateVoiceover: generateVoiceoverEngine }))

const writeVideoScript = vi.hoisted(() => vi.fn())
vi.mock('@/lib/engine/script', () => ({ writeVideoScript }))

const cutScriptIntoBeats = vi.hoisted(() => vi.fn())
vi.mock('@/lib/engine/beats', () => ({ cutScriptIntoBeats }))

import { createCutBeatsTool } from '../cut-beats'
import { createGenerateVoiceoverTool } from '../generate-voiceover'
import { createWriteScriptTool } from '../write-script'

// A script long enough that the tool-history digest would truncate it. Threading text of
// this size through the model is what used to force the agent to call writeScript again
// just to obtain a complete script — so every stage here must work from the id instead.
const LONG_SCRIPT = `${'The Roman aqueducts changed everything. '.repeat(120)}`.trim()

/** Invoke a tool's execute with the bits of ToolCallOptions these tools actually read. */
const run = (t: any, input: unknown) =>
  t.execute(input, { abortSignal: undefined, toolCallId: 'call-1', messages: [] })

describe('writeScript', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    writeVideoScript.mockResolvedValue({
      brief: 'a brief',
      script: LONG_SCRIPT,
      words: 720
    })
  })

  it('stores the script and returns an id to carry forward', async () => {
    const result: any = await run(createWriteScriptTool('m'), { topic: 'Rome' })

    expect(result.scriptId).toMatch(/^sc_/)
    // The full text must land in KV, because the model cannot carry it between turns.
    const [key, handle] = kvSetJSON.mock.calls[0]
    expect(key).toBe(`script:${result.scriptId}`)
    expect((handle as any).script).toBe(LONG_SCRIPT)
    // Still returned for display in the same turn.
    expect(result.script).toBe(LONG_SCRIPT)
  })
})

describe('generateVoiceover', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    generateVoiceoverEngine.mockResolvedValue({
      audioUrl: 'https://cdn/vo.mp3',
      words: [{ word: 'The', start: 0, end: 0.2 }],
      durationSec: 42,
      voiceId: 'elevenlabs_x'
    })
  })

  it('voices the stored script when given a scriptId', async () => {
    kvGetJSON.mockResolvedValue({ script: LONG_SCRIPT })

    const result: any = await run(createGenerateVoiceoverTool(), {
      scriptId: 'sc_abc'
    })

    expect(kvGetJSON).toHaveBeenCalledWith('script:sc_abc')
    // The exact approved script is voiced — no rewrite, no truncation.
    expect(generateVoiceoverEngine).toHaveBeenCalledWith(
      LONG_SCRIPT,
      expect.anything()
    )
    expect(result.voiceoverId).toMatch(/^vo_/)
  })

  it('prefers the stored script over any text the model retyped', async () => {
    kvGetJSON.mockResolvedValue({ script: LONG_SCRIPT })

    await run(createGenerateVoiceoverTool(), {
      scriptId: 'sc_abc',
      script: 'a short paraphrase the model invented'
    })

    expect(generateVoiceoverEngine).toHaveBeenCalledWith(
      LONG_SCRIPT,
      expect.anything()
    )
  })

  it('asks rather than silently rewriting when the scriptId has expired', async () => {
    kvGetJSON.mockResolvedValue(null)

    await expect(
      run(createGenerateVoiceoverTool(), { scriptId: 'sc_gone' })
    ).rejects.toThrow(/do not silently rewrite/i)
    expect(generateVoiceoverEngine).not.toHaveBeenCalled()
  })

  it('still accepts raw script text when there is no id', async () => {
    // A user pasting their own script has no scriptId, and that must keep working.
    await run(createGenerateVoiceoverTool(), { script: 'my own script' })
    expect(generateVoiceoverEngine).toHaveBeenCalledWith(
      'my own script',
      expect.anything()
    )
  })

  it('fails clearly when given neither', async () => {
    await expect(run(createGenerateVoiceoverTool(), {})).rejects.toThrow(
      /needs either a scriptId/i
    )
  })
})

describe('cutBeats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cutScriptIntoBeats.mockResolvedValue({ shots: [] })
  })

  it('segments the stored script when given a scriptId', async () => {
    kvGetJSON.mockImplementation(async (key: string) =>
      key.startsWith('script:') ? { script: LONG_SCRIPT } : null
    )

    await run(createCutBeatsTool('m'), { scriptId: 'sc_abc' })

    expect(cutScriptIntoBeats).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ script: LONG_SCRIPT }),
      undefined
    )
  })

  it('fails clearly when given neither a scriptId nor text', async () => {
    kvGetJSON.mockResolvedValue(null)
    await expect(run(createCutBeatsTool('m'), {})).rejects.toThrow(
      /needs either a scriptId/i
    )
  })
})
