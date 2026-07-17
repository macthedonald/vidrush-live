// Remotion Lambda render wrapper — the only renderer (replaces the former Fly.io/ffmpeg
// worker). It kicks off a distributed render of the "Storyboard" composition and polls to
// completion, returning the finished MP4's public URL.
//
// This is server-only — it is only imported by the composeRender tool, which runs on the
// server, and `@remotion/lambda/client` bundles the AWS SDK. It reads its configuration
// from env; see docs/REMOTION_LAMBDA.md for the one-time deploy that produces
// REMOTION_SERVE_URL + REMOTION_FUNCTION_NAME.
import {
  type AwsRegion,
  getRenderProgress,
  renderMediaOnLambda,
  speculateFunctionName
} from '@remotion/lambda/client'

import type { StoryboardInput } from '@/remotion/schema'

const COMPOSITION_ID = 'Storyboard'

export interface LambdaRenderResult {
  url: string
  sizeInBytes?: number
  renderId: string
  bucketName: string
}

export interface LambdaRenderHandle {
  renderId: string
  bucketName: string
}

export interface LambdaProgress {
  done: boolean
  progress: number // 0..100
  url?: string
  sizeInBytes?: number
  error?: string
}

export function isLambdaConfigured(): boolean {
  return Boolean(
    process.env.REMOTION_SERVE_URL &&
      (process.env.REMOTION_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID)
  )
}

function region(): AwsRegion {
  return (process.env.REMOTION_LAMBDA_REGION ||
    process.env.AWS_REGION ||
    'us-east-1') as AwsRegion
}

// Resolve the deployed Lambda function name. Prefer an explicit name; otherwise derive it
// from the memory/disk/timeout knobs the way `remotion lambda deploy` does.
function functionName(): string {
  if (process.env.REMOTION_FUNCTION_NAME)
    return process.env.REMOTION_FUNCTION_NAME
  return speculateFunctionName({
    memorySizeInMb: Number(process.env.REMOTION_LAMBDA_MEMORY || 2048),
    diskSizeInMb: Number(process.env.REMOTION_LAMBDA_DISK || 2048),
    timeoutInSeconds: Number(process.env.REMOTION_LAMBDA_TIMEOUT || 240)
  })
}

/**
 * Kick off a Lambda render of the storyboard and return immediately with a handle the
 * caller polls with getLambdaProgress. Used by the /studio Render button so the UI stays
 * responsive while frames fan out across invocations. Throws if Lambda isn't configured.
 */
export async function startLambdaRender(
  inputProps: StoryboardInput
): Promise<LambdaRenderHandle> {
  const serveUrl = process.env.REMOTION_SERVE_URL
  if (!serveUrl) {
    throw new Error(
      'REMOTION_SERVE_URL is not set — deploy the Remotion site/function first (see docs/REMOTION_LAMBDA.md).'
    )
  }
  const { renderId, bucketName } = await renderMediaOnLambda({
    region: region(),
    functionName: functionName(),
    serveUrl,
    composition: COMPOSITION_ID,
    inputProps,
    codec: 'h264',
    imageFormat: 'jpeg',
    privacy:
      (process.env.REMOTION_RENDER_PRIVACY as 'public' | 'private') || 'public',
    downloadBehavior: { type: 'play-in-browser' },
    ...(process.env.REMOTION_OUTPUT_BUCKET
      ? {
          outName: {
            bucketName: process.env.REMOTION_OUTPUT_BUCKET,
            key: `renders/${renderKey()}.mp4`
          }
        }
      : {})
  })
  return { renderId, bucketName }
}

/** Poll a running Lambda render. Never throws for an in-progress render. */
export async function getLambdaProgress(
  handle: LambdaRenderHandle
): Promise<LambdaProgress> {
  const progress = await getRenderProgress({
    renderId: handle.renderId,
    bucketName: handle.bucketName,
    functionName: functionName(),
    region: region()
  })
  if (progress.fatalErrorEncountered) {
    return {
      done: true,
      progress: Math.round((progress.overallProgress || 0) * 100),
      error: progress.errors?.[0]?.message || 'unknown Lambda render error'
    }
  }
  return {
    done: progress.done,
    progress: Math.round((progress.overallProgress || 0) * 100),
    url: progress.outputFile ?? undefined,
    sizeInBytes: progress.outputSizeInBytes ?? undefined
  }
}

/**
 * Render a storyboard to MP4 on Remotion Lambda and wait for the result.
 * Convenience wrapper over startLambdaRender + getLambdaProgress.
 */
export async function renderStoryboardOnLambda(
  inputProps: StoryboardInput,
  opts: { onProgress?: (pct: number) => void; signal?: AbortSignal } = {}
): Promise<LambdaRenderResult> {
  const handle = await startLambdaRender(inputProps)
  while (true) {
    if (opts.signal?.aborted) throw new Error('render aborted')
    const p = await getLambdaProgress(handle)
    if (p.error) throw new Error(`Remotion Lambda render failed: ${p.error}`)
    if (p.done) {
      if (!p.url)
        throw new Error('Remotion Lambda finished without an output URL')
      return {
        url: p.url,
        sizeInBytes: p.sizeInBytes,
        renderId: handle.renderId,
        bucketName: handle.bucketName
      }
    }
    opts.onProgress?.(p.progress)
    await sleep(2000)
  }
}

function renderKey(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
