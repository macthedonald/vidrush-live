import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createImageTask,
  generateImage,
  getImageTask,
  ImageTaskPendingError
} from '../image'

// Every shape and failure mode asserted here was observed against api.ai33.pro with a live
// key, not invented: the imagen2 `result_images[].imageUrl` payload, the intermittent 503
// `server_busy` that interleaves with healthy 200s, and renders that stay "doing" for
// minutes before completing.

const TASK_ID = 'b84ebe4c-197e-4e3c-8720-c0121e1f6421'
const IMAGE_URL = `https://cdn.ai33.pro/imagen2/${TASK_ID}/3czLJXyAMcs6PBhU1gX9.png?dl=1`

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

const createOk = () => jsonResponse(200, { success: true, task_id: TASK_ID })

const busy = () =>
  jsonResponse(503, {
    success: false,
    code: 'server_busy',
    message: 'Task polling temporarily busy'
  })

const doing = () => jsonResponse(200, { id: TASK_ID, status: 'doing', progress: null })

const done = () =>
  jsonResponse(200, {
    id: TASK_ID,
    status: 'done',
    progress: 100,
    type: 'imagen2',
    metadata: {
      modelId: 'gemini-3-pro-image-preview',
      result_images: [
        {
          id: '3czLJXyAMcs6PBhU1gX9',
          width: 2752,
          height: 1536,
          imageUrl: IMAGE_URL,
          mimeType: 'image/png'
        }
      ]
    }
  })

/** Answer the create call once, then hand back `polls` in order. */
function mockFetchSequence(polls: Array<() => Response>) {
  let i = 0
  return vi.fn(async () => (i === 0 ? (i++, createOk()) : polls[i++ - 1]()))
}

describe('generateImage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    process.env.AI33_API_KEY = 'test-key'
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  /** Run the generation while letting the poller's sleeps elapse instantly. */
  async function run() {
    const promise = generateImage('an astronaut on Mars')
    // Poll gaps are jittered sleeps; drain them until the promise settles.
    const settled = promise.then(
      v => ({ ok: true as const, v }),
      e => ({ ok: false as const, e })
    )
    for (let i = 0; i < 200; i++) {
      await vi.advanceTimersByTimeAsync(20000)
      const raced = await Promise.race([settled, Promise.resolve(null)])
      if (raced) return raced
    }
    return settled
  }

  it('extracts the URL from the imagen2 result_images shape', async () => {
    vi.stubGlobal('fetch', mockFetchSequence([done]))
    const result = await run()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // A render that succeeded upstream must not be reported as "no image URL".
    expect(result.v.imageUrl).toBe(IMAGE_URL)
    // Dimensions live on the result entry, not the metadata root.
    expect(result.v.width).toBe(2752)
    expect(result.v.height).toBe(1536)
  })

  it('rides out the intermittent 503 server_busy instead of failing the render', async () => {
    // The live API interleaves these with healthy 200s for the whole render.
    vi.stubGlobal(
      'fetch',
      mockFetchSequence([busy, busy, doing, busy, busy, busy, doing, busy, done])
    )
    const result = await run()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.v.imageUrl).toBe(IMAGE_URL)
  })

  it('still fails when the task itself reports a terminal error', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchSequence([
        doing,
        () => jsonResponse(200, { id: TASK_ID, status: 'failed', error_message: 'content blocked' })
      ])
    )
    const result = await run()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(String(result.e)).toContain('content blocked')
  })

  it('does not treat an error_message on a running task as fatal', async () => {
    // Upstream attaches throttle notices to tasks that are still cooking; killing the
    // render on one threw away generations that would have finished.
    vi.stubGlobal(
      'fetch',
      mockFetchSequence([
        () =>
          jsonResponse(200, {
            id: TASK_ID,
            status: 'doing',
            error_message: 'Task polling temporarily busy'
          }),
        done
      ])
    )
    const result = await run()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.v.imageUrl).toBe(IMAGE_URL)
  })

  it('names the create phase when task creation is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(500, { error_message: 'Invalid model_id' }))
    )
    const result = await run()
    expect(result.ok).toBe(false)
    if (result.ok) return
    // Create-time and poll-time failures used to be indistinguishable.
    expect(String(result.e)).toContain('could not be created')
    expect(String(result.e)).toContain('Invalid model_id')
  })

  it('gives up when polling never recovers', async () => {
    vi.stubGlobal('fetch', mockFetchSequence(Array(60).fill(busy)))
    const result = await run()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(String(result.e)).toContain('could not be polled')
  })

  it('reports a still-running render as pending, carrying the task id', async () => {
    // A render measured at 31 minutes cannot be awaited inside a request. Callers that run
    // out of time need the id so the work can be collected elsewhere, not an error that
    // implies the image never existed.
    vi.stubGlobal('fetch', mockFetchSequence(Array(60).fill(doing)))
    const promise = generateImage('an astronaut on Mars', { timeoutMs: 30000 })
    const settled = promise.then(
      v => ({ ok: true as const, v }),
      e => ({ ok: false as const, e })
    )
    for (let i = 0; i < 200; i++) {
      await vi.advanceTimersByTimeAsync(20000)
      const raced = await Promise.race([settled, Promise.resolve(null)])
      if (raced) break
    }
    const result = await settled
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.e).toBeInstanceOf(ImageTaskPendingError)
    expect((result.e as ImageTaskPendingError).taskId).toBe(TASK_ID)
  })
})

describe('createImageTask', () => {
  beforeEach(() => {
    process.env.AI33_API_KEY = 'test-key'
  })
  afterEach(() => vi.unstubAllGlobals())

  it('returns the task id without waiting for the render', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => createOk()))
    const task = await createImageTask('an astronaut on Mars')
    expect(task.taskId).toBe(TASK_ID)
    // Nothing was awaited, so no image yet — that is the point.
    expect(task.imageUrl).toBeUndefined()
  })

  it('fails when the backend returns neither a task id nor an image', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { success: true })))
    await expect(createImageTask('an astronaut on Mars')).rejects.toThrow(
      /neither a task id nor an image URL/
    )
  })
})

describe('getImageTask', () => {
  beforeEach(() => {
    process.env.AI33_API_KEY = 'test-key'
  })
  afterEach(() => vi.unstubAllGlobals())

  it('maps a finished task to its image URL and dimensions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => done()))
    const state = await getImageTask(TASK_ID)
    expect(state).toEqual({
      status: 'done',
      imageUrl: IMAGE_URL,
      width: 2752,
      height: 1536
    })
  })

  it('reports the 503 throttle as busy, not as a failure', async () => {
    // 'busy' says nothing about the render; the client must keep polling.
    vi.stubGlobal('fetch', vi.fn(async () => busy()))
    expect(await getImageTask(TASK_ID)).toEqual({ status: 'busy' })
  })

  it('reports a running task as pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { id: TASK_ID, status: 'doing', progress: 42 }))
    )
    expect(await getImageTask(TASK_ID)).toEqual({ status: 'pending', progress: 42 })
  })

  it('reports a terminal failure with its reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, { id: TASK_ID, status: 'failed', error_message: 'content blocked' })
      )
    )
    expect(await getImageTask(TASK_ID)).toEqual({
      status: 'failed',
      error: 'content blocked'
    })
  })
})
