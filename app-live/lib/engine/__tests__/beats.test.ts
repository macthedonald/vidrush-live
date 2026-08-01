import { beforeEach, describe, expect, it, vi } from 'vitest'

// The engine streams shots via `streamObject` and resolves models through the registry;
// both are stubbed so these tests exercise our own segmentation logic only.
const streamObject = vi.hoisted(() => vi.fn())
vi.mock('ai', () => ({ streamObject }))
vi.mock('@/lib/utils/registry', () => ({ getModel: (m: string) => m }))

import { bindVoiceTimings, cutScriptIntoBeats } from '../beats'

type Shot = {
  narration: string
  kind?: string
  visualQuery?: string
  visualIntent?: string
}

/** Drive `elementStream` from a fixed list, optionally throwing partway through. */
function mockStream(shots: Shot[], failAfter?: number) {
  streamObject.mockReturnValue({
    elementStream: (async function* () {
      for (let i = 0; i < shots.length; i++) {
        if (failAfter !== undefined && i === failAfter) {
          throw new Error('stream died mid-generation')
        }
        yield shots[i]
      }
    })()
  })
}

const shot = (narration: string): Shot => ({
  narration,
  kind: 'video',
  visualQuery: `${narration} query`,
  visualIntent: `show ${narration}`
})

describe('cutScriptIntoBeats', () => {
  beforeEach(() => {
    streamObject.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('builds a storyboard from streamed shots with sequential timings', async () => {
    mockStream([shot('First beat here'), shot('Second beat here')])

    const sb = await cutScriptIntoBeats('google:gemini-2.5-flash', {
      script: 'First beat here Second beat here',
      topic: 'Test'
    })

    expect(sb.shots).toHaveLength(2)
    expect(sb.shots[0].start).toBe(0)
    // Each shot starts where the previous one ended — no gaps, no overlap.
    expect(sb.shots[1].start).toBeCloseTo(sb.shots[0].duration, 3)
    expect(sb.totalSeconds).toBeCloseTo(
      sb.shots[1].start + sb.shots[1].duration,
      2
    )
    expect(sb.estimatedTimings).toBe(true)
    // Word timings stay inside their shot so karaoke captions can't drift.
    const words = sb.shots[0].words
    expect(words.at(-1)!.end).toBeCloseTo(
      sb.shots[0].start + sb.shots[0].duration,
      3
    )
  })

  // The original bug: a truncated or stalled generation threw away everything and the
  // tool crashed after a long wait. Partial output must degrade to a shorter storyboard.
  it('keeps the shots already received when the stream fails partway', async () => {
    mockStream([shot('One'), shot('Two'), shot('Three')], 2)

    const sb = await cutScriptIntoBeats('google:gemini-2.5-flash', {
      script: 'One Two Three'
    })

    expect(sb.shots).toHaveLength(2)
    expect(sb.shots.map(s => s.narration)).toEqual(['One', 'Two'])
  })

  it('rethrows only when the stream yields nothing usable', async () => {
    mockStream([shot('One')], 0)
    await expect(
      cutScriptIntoBeats('google:gemini-2.5-flash', { script: 'One' })
    ).rejects.toThrow('stream died mid-generation')

    mockStream([{ narration: '   ' }, { narration: '' }])
    await expect(
      cutScriptIntoBeats('google:gemini-2.5-flash', { script: 'One' })
    ).rejects.toThrow('produced no shots')
  })

  it('reports progress as each shot lands', async () => {
    mockStream([shot('One'), shot('Two'), shot('Three')])
    const seen: number[] = []

    await cutScriptIntoBeats(
      'google:gemini-2.5-flash',
      { script: 'One Two Three' },
      undefined,
      n => seen.push(n)
    )

    expect(seen).toEqual([1, 2, 3])
  })

  it('defaults a missing kind to photo and backfills absent visual fields', async () => {
    mockStream([{ narration: 'Bare shot' }])

    const sb = await cutScriptIntoBeats('google:gemini-2.5-flash', {
      script: 'Bare shot',
      topic: 'Fallback topic'
    })

    expect(sb.shots[0].kind).toBe('photo')
    expect(sb.shots[0].visualQuery).toBe('Fallback topic')
    expect(sb.shots[0].visualIntent).toBe('Bare shot')
  })

  it('rejects an empty script without calling the model', async () => {
    await expect(
      cutScriptIntoBeats('google:gemini-2.5-flash', { script: '   ' })
    ).rejects.toThrow('no script to segment')
    expect(streamObject).not.toHaveBeenCalled()
  })

  it('locks shots to real voice timings when they are supplied', async () => {
    mockStream([shot('Hello there'), shot('Goodbye now')])

    const sb = await cutScriptIntoBeats('google:gemini-2.5-flash', {
      script: 'Hello there Goodbye now',
      voiceWords: [
        { word: 'Hello', start: 0, end: 0.5 },
        { word: 'there', start: 0.5, end: 1 },
        { word: 'Goodbye', start: 1.2, end: 1.8 },
        { word: 'now', start: 1.8, end: 2.4 }
      ] as any
    })

    expect(sb.estimatedTimings).toBe(false)
    // Shot 2 begins at its first spoken word; the pause folds into shot 1.
    expect(sb.shots[1].start).toBeCloseTo(1.2, 3)
    expect(sb.totalSeconds).toBeCloseTo(2.4, 2)
  })
})

describe('bindVoiceTimings', () => {
  const core = (narration: string) => ({
    narration,
    kind: 'photo' as const,
    visualQuery: 'q',
    visualIntent: 'i'
  })

  it('tiles shot boundaries across the audio with no drift', () => {
    const shots = bindVoiceTimings([core('a b'), core('c d')], [
      { word: 'a', start: 0, end: 0.4 },
      { word: 'b', start: 0.4, end: 0.8 },
      { word: 'c', start: 1, end: 1.4 },
      { word: 'd', start: 1.4, end: 2 }
    ] as any)

    expect(shots[0].start).toBe(0)
    expect(shots[0].start + shots[0].duration).toBeCloseTo(shots[1].start, 3)
    expect(shots[1].start + shots[1].duration).toBeCloseTo(2, 3)
  })

  it('gives leftover words to the last shot so none are dropped', () => {
    const shots = bindVoiceTimings([core('a'), core('b')], [
      { word: 'a', start: 0, end: 0.5 },
      { word: 'b', start: 0.5, end: 1 },
      { word: 'extra', start: 1, end: 1.5 }
    ] as any)

    expect(shots.at(-1)!.words.map(w => w.word)).toEqual(['b', 'extra'])
    expect(shots.at(-1)!.start + shots.at(-1)!.duration).toBeCloseTo(1.5, 3)
  })
})
