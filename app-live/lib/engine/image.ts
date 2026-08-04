// Kakkao engine — image generation via AI33's Imagen API (https://api.ai33.pro), the same
// gateway that fronts voiceover and music. Two models flow through here:
//   • gpt-image-2                — general still / b-roll frame generation
//   • gemini-3-pro-image-preview — Google's Gemini 3 Pro Image, a.k.a. "Nano Banana Pro",
//                        tuned for thumbnails (crisp overlay text, reference conditioning)
//
// Per the AI33 docs the Imagen flow is async, task-based, and multipart:
//   POST /v1i/task/generate-image  (FormData: prompt, model_id, generations_count,
//        model_parameters JSON, repeated `assets` files for reference images) → { task_id }
//   poll GET /v1/task/{task_id} until status="done" → metadata.image_url. Task type is
// "imagen2". The endpoint path and model ids are env-overridable (AI33_IMAGE_TASK_PATH /
// AI33_IMAGE_MODEL / AI33_THUMBNAIL_MODEL); confirm exact model ids with GET /v1i/models.

export const AI33_DEFAULT_BASE = 'https://api.ai33.pro'
export const DEFAULT_IMAGE_MODEL = process.env.AI33_IMAGE_MODEL || 'gpt-image-2'
// "Nano Banana Pro" is Google's marketing name for Gemini 3 Pro Image, but AI33 does not
// accept that string as a model id — posting `nano-banana-pro` returns
// "Invalid model_id" and every thumbnail render fails. The id AI33 actually publishes for
// that model is `gemini-3-pro-image-preview` (verified against a live 500 from
// POST /v1i/task/generate-image, whose error lists the accepted ids).
export const DEFAULT_THUMBNAIL_MODEL =
  process.env.AI33_THUMBNAIL_MODEL || 'gemini-3-pro-image-preview'
const IMAGE_TASK_PATH =
  process.env.AI33_IMAGE_TASK_PATH || '/v1i/task/generate-image'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const trimBase = (b?: string) => (b || AI33_DEFAULT_BASE).replace(/\/$/, '')

async function jfetch(url: string, opts: RequestInit): Promise<any> {
  const r = await fetch(url, opts)
  let d: any = null
  try {
    d = await r.json()
  } catch {
    /* non-JSON */
  }
  if (!r.ok) {
    throw new Error(
      d?.error_message || d?.message || d?.error || `AI33 HTTP ${r.status}`
    )
  }
  return d
}

// Pull an image URL out of a completed task's metadata (or a sync create-response),
// tolerating the shapes different AI33 image backends return.
//
// `result_images` is the shape the imagen2 task type actually returns, and its entries key
// the URL as `imageUrl`, not `url`. Missing it meant a perfectly good render — the PNG was
// sitting on cdn.ai33.pro — surfaced to the user as "returned no image URL". Verified
// against a completed task: metadata.result_images[0].imageUrl, alongside width, height,
// mimeType and a _preview.png variant.
function extractImageUrl(d: any): string | undefined {
  if (!d) return undefined
  const meta = d.metadata || d
  const first = (a: unknown): any => (Array.isArray(a) ? a[0] : undefined)
  const fromEntry = (e: any): string | undefined =>
    typeof e === 'string' ? e : e?.imageUrl || e?.image_url || e?.url
  return (
    fromEntry(first(meta.result_images)) ||
    meta.image_url ||
    meta.url ||
    meta.output_url ||
    fromEntry(first(meta.image_urls)) ||
    fromEntry(first(meta.images)) ||
    fromEntry(first(meta.assets)) ||
    fromEntry(first(meta.data)) ||
    fromEntry(first(d.output)) ||
    undefined
  )
}

// Dimensions live on the result entry, not on the metadata root.
function extractDimensions(meta: any): { width?: number; height?: number } {
  const entry = Array.isArray(meta?.result_images) ? meta.result_images[0] : undefined
  return {
    width: Number(entry?.width ?? meta?.width) || undefined,
    height: Number(entry?.height ?? meta?.height) || undefined
  }
}

// A single poll that reports transport/HTTP problems instead of throwing, so the caller
// can decide whether they are fatal. jfetch can't do this: it collapses every non-OK
// response into an exception, which is right for creating a task and wrong for watching one.
async function pollOnce(
  url: string,
  key: string,
  abortSignal?: AbortSignal
): Promise<
  { ok: true; body: any } | { ok: false; status: number; message: string }
> {
  let r: Response
  try {
    r = await fetch(url, {
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      signal: abortSignal
    })
  } catch (error) {
    if (abortSignal?.aborted) throw error
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'network error'
    }
  }
  let d: any = null
  try {
    d = await r.json()
  } catch {
    /* non-JSON */
  }
  if (!r.ok) {
    return {
      ok: false,
      status: r.status,
      message:
        d?.error_message || d?.message || d?.error || `AI33 HTTP ${r.status}`
    }
  }
  return { ok: true, body: d ?? {} }
}

// How many polls may fail back-to-back before we accept the task is unreachable. AI33
// throttles its task endpoint under load — it answers "Task polling temporarily busy" —
// and can briefly 404 a task straight after creating it. Both are the poller's problem,
// not the render's: the image keeps cooking upstream either way.
const MAX_CONSECUTIVE_POLL_FAILURES = 12
const MAX_POLL_INTERVAL_MS = 15000

async function pollTask(
  base: string,
  key: string,
  taskId: string,
  {
    intervalMs = 3000,
    // Default sits under the 300s ceiling a Vercel function gets, so a stuck task surfaces
    // this message rather than the platform killing the request and returning a generic
    // gateway error. Callers inside a streaming response should pass something smaller.
    timeoutMs = 240000,
    abortSignal
  }: {
    intervalMs?: number
    timeoutMs?: number
    abortSignal?: AbortSignal
  } = {}
): Promise<any> {
  const t0 = Date.now()
  const url = `${base}/v1/task/${taskId}`
  let failures = 0
  let polls = 0
  let backoff = intervalMs
  let lastError = ''

  while (Date.now() - t0 < timeoutMs) {
    if (abortSignal?.aborted) throw new Error('aborted')
    // Jitter. A studio batch runs up to four tasks at once and they would otherwise poll
    // in lockstep, which is a good way to draw the very throttling we're backing off from.
    await sleep(backoff * (0.75 + Math.random() * 0.5))
    if (abortSignal?.aborted) throw new Error('aborted')

    polls++
    const res = await pollOnce(url, key, abortSignal)

    if (!res.ok) {
      lastError = res.message
      if (++failures > MAX_CONSECUTIVE_POLL_FAILURES) {
        throw new Error(
          `AI33 task ${taskId} could not be polled after ${failures} attempts: ${lastError}`
        )
      }
      backoff = Math.min(backoff * 2, MAX_POLL_INTERVAL_MS)
      continue
    }

    failures = 0
    backoff = intervalMs
    const d = res.body
    if (d.status === 'done') return d.metadata || {}
    // Only a terminal status means the render died. An error_message on a task that is
    // still queued or running is upstream noise — throttle notices arrive that way — and
    // treating it as fatal threw away generations that would have finished.
    if (d.status === 'error' || d.status === 'failed') {
      throw new Error(d.error_message || 'AI33 image task failed')
    }
  }

  throw new Error(
    `AI33 image task timed out after ${polls} polls${lastError ? ` (last poll error: ${lastError})` : ''}`
  )
}

// Studio uploads arrive as `data:image/jpeg;base64,…` rather than as fetchable URLs.
// Decoding them here avoids relying on fetch's data: scheme support and keeps the error
// message useful when the payload is malformed.
function dataUrlToBlob(dataUrl: string): Blob {
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl)
  if (!m) throw new Error('malformed data URL')
  const [, mime, isBase64, payload] = m
  const bytes = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8')
  if (!bytes.length) throw new Error('empty data URL')
  return new Blob([bytes], { type: mime || 'application/octet-stream' })
}

export interface ImageResult {
  /** AI33-hosted URL of the generated image. */
  imageUrl: string
  model: string
  width?: number
  height?: number
  /** The model's revised/expanded prompt, when returned. */
  revisedPrompt?: string
}

export interface GenerateImageOptions {
  apiKey?: string
  baseUrl?: string
  /** AI33 Imagen model id (see GET /v1i/models). Defaults to gpt-image-2. */
  model?: string
  /** Aspect ratio passed in model_parameters, e.g. "16:9", "1:1", "9:16". */
  aspectRatio?: string
  /** Resolution passed in model_parameters, e.g. "1K", "2K". Defaults to "2K". */
  resolution?: string
  /** Extra model_parameters merged in (model-specific knobs). */
  modelParameters?: Record<string, unknown>
  /** Reference image URL(s) — uploaded as `assets` and referenced as @img1, @img2… */
  referenceImages?: string[]
  /** How long generateImage may wait for the render before giving up. */
  timeoutMs?: number
  abortSignal?: AbortSignal
}

/**
 * The render is still going, we just ran out of time to wait for it.
 *
 * Carries the task id so a caller that cannot block any longer — a chat tool inside a
 * streaming response, say — can hand the user somewhere to pick the result up instead of
 * reporting a failure for an image that is about to exist.
 */
export class ImageTaskPendingError extends Error {
  constructor(
    readonly taskId: string,
    readonly model: string,
    message: string
  ) {
    super(message)
    this.name = 'ImageTaskPendingError'
  }
}

// Build the multipart body for a create-task call. Reference images are uploaded as
// `assets` and referenced as @img1, @img2… in the prompt, with the count of @img tokens
// matching the file count. A reference that won't download (dead competitor thumbnail,
// expired signed URL) must not sink the generation — we drop it and renumber so the tokens
// still line up.
async function buildTaskForm(
  prompt: string,
  model: string,
  opts: GenerateImageOptions
): Promise<FormData> {
  let clean = prompt
  const modelParameters: Record<string, unknown> = {
    ...(opts.aspectRatio ? { aspect_ratio: opts.aspectRatio } : {}),
    resolution: opts.resolution || '2K',
    ...opts.modelParameters
  }

  const fd = new FormData()
  fd.append('prompt', clean)
  fd.append('model_id', model)
  fd.append('generations_count', '1')
  fd.append('model_parameters', JSON.stringify(modelParameters))

  const refs = (opts.referenceImages || []).filter(Boolean)
  if (refs.length) {
    const tokens: string[] = []
    for (const ref of refs) {
      let blob: Blob
      try {
        blob = ref.startsWith('data:')
          ? dataUrlToBlob(ref)
          : await (async () => {
              const res = await fetch(ref, { signal: opts.abortSignal })
              if (!res.ok) throw new Error(`HTTP ${res.status}`)
              return res.blob()
            })()
      } catch (error) {
        if (opts.abortSignal?.aborted) throw error
        console.warn(`[Image] Skipping unreadable reference ${ref}:`, error)
        continue
      }
      const n = tokens.length + 1
      fd.append('assets', blob, `img${n}`)
      tokens.push(`@img${n}`)
    }
    // Ensure the prompt references every uploaded asset (required by the API), and drop
    // @imgN mentions for references that failed to upload.
    clean = clean
      .replace(/@img\d+/g, t => (tokens.includes(t) ? t : ''))
      .replace(/\s{2,}/g, ' ')
      .trim()
    const missing = tokens.filter(t => !clean.includes(t))
    if (missing.length) {
      clean = `${clean} Use ${missing.join(', ')} as reference.`
    }
    fd.set('prompt', clean)
  }

  return fd
}

export interface ImageTask {
  taskId: string
  model: string
  /** Set when the backend answered synchronously and no polling is needed. */
  imageUrl?: string
}

/**
 * Start a render and return its task id without waiting for it.
 *
 * A 2K gemini-3-pro-image render was measured still "doing" past 549s, well beyond the
 * 300s ceiling a Vercel function gets. Anything that waits inside a single request is
 * therefore guaranteed to be killed mid-render, so callers that live in a request/response
 * cycle must create the task here and poll it from the client via getImageTask.
 */
export async function createImageTask(
  prompt: string,
  opts: GenerateImageOptions = {}
): Promise<ImageTask> {
  const apiKey = opts.apiKey || process.env.AI33_API_KEY || ''
  if (!apiKey) throw new Error('AI33_API_KEY is not set')
  const clean = (prompt || '').trim()
  if (!clean) throw new Error('no image prompt')
  const base = trimBase(opts.baseUrl || process.env.AI33_BASE_URL)
  const model = opts.model || DEFAULT_IMAGE_MODEL
  const fd = await buildTaskForm(clean, model, opts)

  // Name the failing phase. "Invalid model_id" (create) and "Task polling temporarily
  // busy" (poll) are very different problems, and telling them apart from the surfaced
  // message alone used to be guesswork.
  let created: any
  try {
    created = await jfetch(`${base}${IMAGE_TASK_PATH}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: fd,
      signal: opts.abortSignal
    })
  } catch (error) {
    if (opts.abortSignal?.aborted) throw error
    throw new Error(
      `AI33 image task could not be created: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  const immediate = extractImageUrl(created)
  const taskId = created?.task_id || created?.id
  if (!taskId && !immediate) {
    throw new Error(
      created?.error_message ||
        'AI33 accepted the request but returned neither a task id nor an image URL (check AI33_IMAGE_TASK_PATH / model id via GET /v1i/models)'
    )
  }
  return { taskId, model, ...(immediate ? { imageUrl: immediate } : {}) }
}

export type ImageTaskState =
  | { status: 'pending'; progress?: number }
  | { status: 'busy' }
  | { status: 'done'; imageUrl: string; width?: number; height?: number }
  | { status: 'failed'; error: string }

/**
 * Read a task's current state once, without waiting.
 *
 * 'busy' is its own state on purpose: AI33 answers roughly a third of polls with
 * 503 `server_busy` ("Task polling temporarily busy") interleaved with perfectly healthy
 * 200s. It says nothing about the render and callers should simply poll again.
 */
export async function getImageTask(
  taskId: string,
  opts: { apiKey?: string; baseUrl?: string; abortSignal?: AbortSignal } = {}
): Promise<ImageTaskState> {
  const apiKey = opts.apiKey || process.env.AI33_API_KEY || ''
  if (!apiKey) throw new Error('AI33_API_KEY is not set')
  const base = trimBase(opts.baseUrl || process.env.AI33_BASE_URL)

  const res = await pollOnce(`${base}/v1/task/${taskId}`, apiKey, opts.abortSignal)
  if (!res.ok) return { status: 'busy' }

  const d = res.body
  if (d.status === 'done') {
    const meta = d.metadata || {}
    const imageUrl = extractImageUrl(meta)
    if (!imageUrl) {
      return {
        status: 'failed',
        error: 'the render finished but AI33 returned no image URL'
      }
    }
    return { status: 'done', imageUrl, ...extractDimensions(meta) }
  }
  if (d.status === 'error' || d.status === 'failed') {
    return { status: 'failed', error: d.error_message || 'AI33 image task failed' }
  }
  return {
    status: 'pending',
    ...(typeof d.progress === 'number' ? { progress: d.progress } : {})
  }
}

// Generate an image and wait for it. Only safe where the caller can afford to block for
// several minutes — see createImageTask for why a request handler cannot.
export async function generateImage(
  prompt: string,
  opts: GenerateImageOptions = {}
): Promise<ImageResult> {
  const apiKey = opts.apiKey || process.env.AI33_API_KEY || ''
  const base = trimBase(opts.baseUrl || process.env.AI33_BASE_URL)
  const created = await createImageTask(prompt, opts)

  let url = created.imageUrl
  let meta: any = {}
  if (!url) {
    try {
      meta = await pollTask(base, apiKey, created.taskId, {
        timeoutMs: opts.timeoutMs,
        abortSignal: opts.abortSignal
      })
    } catch (error) {
      // Distinguish "not finished yet" from "this render died". The task keeps running
      // upstream, so the id is still worth something to the caller.
      const message = error instanceof Error ? error.message : String(error)
      if (/timed out|could not be polled/.test(message)) {
        throw new ImageTaskPendingError(created.taskId, created.model, message)
      }
      throw error
    }
    url = extractImageUrl(meta)
  }

  if (!url) {
    throw new Error('AI33 image generation returned no image URL')
  }

  return {
    imageUrl: url,
    model: created.model,
    ...extractDimensions(meta),
    revisedPrompt: meta.revised_prompt || meta.revisedPrompt || undefined
  }
}
