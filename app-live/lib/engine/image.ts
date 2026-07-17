// Kakkao engine — image generation via AI33's Imagen API (https://api.ai33.pro), the same
// gateway that fronts voiceover and music. Two models flow through here:
//   • gpt-image-2      — general still / b-roll frame generation
//   • nano-banana-pro  — Google's Gemini 3 Pro Image, tuned for thumbnails (crisp overlay
//                        text, reference-image conditioning)
//
// Per the AI33 docs the Imagen flow is async, task-based, and multipart:
//   POST /v1i/task/generate-image  (FormData: prompt, model_id, generations_count,
//        model_parameters JSON, repeated `assets` files for reference images) → { task_id }
//   poll GET /v1/task/{task_id} until status="done" → metadata.image_url. Task type is
// "imagen2". The endpoint path and model ids are env-overridable (AI33_IMAGE_TASK_PATH /
// AI33_IMAGE_MODEL / AI33_THUMBNAIL_MODEL); confirm exact model ids with GET /v1i/models.

export const AI33_DEFAULT_BASE = 'https://api.ai33.pro'
export const DEFAULT_IMAGE_MODEL = process.env.AI33_IMAGE_MODEL || 'gpt-image-2'
export const DEFAULT_THUMBNAIL_MODEL =
  process.env.AI33_THUMBNAIL_MODEL || 'nano-banana-pro'
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
function extractImageUrl(d: any): string | undefined {
  if (!d) return undefined
  const meta = d.metadata || d
  return (
    meta.image_url ||
    meta.url ||
    meta.output_url ||
    (Array.isArray(meta.image_urls) ? meta.image_urls[0] : undefined) ||
    (Array.isArray(meta.images)
      ? meta.images[0]?.url || meta.images[0]
      : undefined) ||
    (Array.isArray(meta.assets)
      ? meta.assets[0]?.url || meta.assets[0]
      : undefined) ||
    (Array.isArray(meta.data)
      ? meta.data[0]?.url || meta.data[0]?.image_url
      : undefined) ||
    (Array.isArray(d.output) ? d.output[0] : undefined) ||
    undefined
  )
}

async function pollTask(
  base: string,
  key: string,
  taskId: string,
  {
    intervalMs = 3000,
    timeoutMs = 300000,
    abortSignal
  }: {
    intervalMs?: number
    timeoutMs?: number
    abortSignal?: AbortSignal
  } = {}
): Promise<any> {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (abortSignal?.aborted) throw new Error('aborted')
    const d = await jfetch(`${base}/v1/task/${taskId}`, {
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      signal: abortSignal
    })
    if (d.status === 'done') return d.metadata || {}
    if (d.status === 'error' || d.status === 'failed' || d.error_message) {
      throw new Error(d.error_message || 'AI33 image task failed')
    }
    await sleep(intervalMs)
  }
  throw new Error('AI33 image task timed out')
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
  abortSignal?: AbortSignal
}

// Generate an image from a text prompt via AI33's Imagen API. Returns the hosted URL.
export async function generateImage(
  prompt: string,
  opts: GenerateImageOptions = {}
): Promise<ImageResult> {
  const apiKey = opts.apiKey || process.env.AI33_API_KEY || ''
  if (!apiKey) throw new Error('AI33_API_KEY is not set')
  let clean = (prompt || '').trim()
  if (!clean) throw new Error('no image prompt')
  const base = trimBase(opts.baseUrl || process.env.AI33_BASE_URL)
  const model = opts.model || DEFAULT_IMAGE_MODEL

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

  // Reference images: AI33 expects each as an uploaded `assets` file, referenced as
  // @img1, @img2… in the prompt, with the count of @img tokens matching the file count.
  const refs = (opts.referenceImages || []).filter(Boolean)
  if (refs.length) {
    const tokens: string[] = []
    for (let i = 0; i < refs.length; i++) {
      const res = await fetch(refs[i], { signal: opts.abortSignal })
      if (!res.ok) throw new Error(`reference image fetch ${res.status}`)
      const blob = await res.blob()
      fd.append('assets', blob, `img${i + 1}`)
      tokens.push(`@img${i + 1}`)
    }
    // Ensure the prompt references every uploaded asset (required by the API).
    const missing = tokens.filter(t => !clean.includes(t))
    if (missing.length) {
      clean = `${clean} Use ${missing.join(', ')} as reference.`
      fd.set('prompt', clean)
    }
  }

  const created = await jfetch(`${base}${IMAGE_TASK_PATH}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: fd,
    signal: opts.abortSignal
  })

  // Async task shape (the documented path): poll until the image is ready.
  let url = extractImageUrl(created)
  let meta: any = created?.metadata || {}
  if (!url && created?.task_id) {
    meta = await pollTask(base, apiKey, created.task_id, {
      abortSignal: opts.abortSignal
    })
    url = extractImageUrl(meta)
  }

  if (!url) {
    throw new Error(
      created?.error_message ||
        'AI33 image generation returned no image URL (check AI33_IMAGE_TASK_PATH / model id via GET /v1i/models)'
    )
  }

  return {
    imageUrl: url,
    model,
    width: Number(meta.width) || undefined,
    height: Number(meta.height) || undefined,
    revisedPrompt: meta.revised_prompt || meta.revisedPrompt || undefined
  }
}
