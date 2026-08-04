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
  // A reference that won't download (dead competitor thumbnail, expired signed URL) must
  // not sink the generation — we drop it and renumber, so the tokens still line up.
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
