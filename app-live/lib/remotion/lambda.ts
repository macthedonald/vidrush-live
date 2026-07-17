// Remotion Lambda render wrapper — the only renderer (replaces the former Fly.io/ffmpeg
// worker). It kicks off a distributed render of the "Storyboard" composition and polls to
// completion, returning the finished MP4's public URL.
//
// This is server-only — it is only imported by the composeRender tool, which runs on the
// server, and `@remotion/lambda/client` bundles the AWS SDK. It reads its configuration
// from env; see docs/REMOTION_LAMBDA.md for the one-time deploy that produces
// REMOTION_SERVE_URL + REMOTION_FUNCTION_NAME.
import {
  getRenderProgress,
  renderMediaOnLambda,
  speculateFunctionName,
  type AwsRegion
} from '@remotion/lambda/client'

import type { StoryboardInput } from '@/remotion/schema'

const COMPOSITION_ID = 'Storyboard'

export interface LambdaRenderResult {
  url: string
  sizeInBytes?: number
  renderId: string
  bucketName: string
}

export function isLambdaConfigured(): boolean {
  return Boolean(
    process.env.REMOTION_SERVE_URL &&
      (process.env.REMOTION_AWS_ACCESS_KEY_ID ||
        process.env.AWS_ACCESS_KEY_ID)
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
  if (process.env.REMOTION_FUNCTION_NAME) return process.env.REMOTION_FUNCTION_NAME
  return speculateFunctionName({
    memorySizeInMb: Number(process.env.REMOTION_LAMBDA_MEMORY || 2048),
    diskSizeInMb: Number(process.env.REMOTION_LAMBDA_DISK || 2048),
    timeoutInSeconds: Number(process.env.REMOTION_LAMBDA_TIMEOUT || 240)
  })
}

/**
 * Render a storyboard to MP4 on Remotion Lambda and wait for the result.
 * Throws if Lambda isn't configured or the render fails.
 */
export async function renderStoryboardOnLambda(
  inputProps: StoryboardInput,
  opts: { onProgress?: (pct: number) => void; signal?: AbortSignal } = {}
): Promise<LambdaRenderResult> {
  const serveUrl = process.env.REMOTION_SERVE_URL
  if (!serveUrl) {
    throw new Error(
      'REMOTION_SERVE_URL is not set — deploy the Remotion site/function first (see docs/REMOTION_LAMBDA.md).'
    )
  }
  const reg = region()
  const fn = functionName()

  const { renderId, bucketName } = await renderMediaOnLambda({
    region: reg,
    functionName: fn,
    serveUrl,
    composition: COMPOSITION_ID,
    inputProps,
    codec: 'h264',
    imageFormat: 'jpeg',
    privacy: (process.env.REMOTION_RENDER_PRIVACY as 'public' | 'private') || 'public',
    downloadBehavior: { type: 'play-in-browser', fileName: null },
    ...(process.env.REMOTION_OUTPUT_BUCKET
      ? { outName: { bucketName: process.env.REMOTION_OUTPUT_BUCKET, key: `renders/${renderKey()}.mp4` } }
      : {})
  })

  // Poll to completion. Lambda renders are fast (frames fan out across invocations), but
  // long enough that we surface progress to the UI via the callback.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (opts.signal?.aborted) throw new Error('render aborted')
    const progress = await getRenderProgress({
      renderId,
      bucketName,
      functionName: fn,
      region: reg
    })
    if (progress.fatalErrorEncountered) {
      const err = progress.errors?.[0]?.message || 'unknown Lambda render error'
      throw new Error(`Remotion Lambda render failed: ${err}`)
    }
    if (progress.done) {
      const url = progress.outputFile
      if (!url) throw new Error('Remotion Lambda finished without an output URL')
      return {
        url,
        sizeInBytes: progress.outputSizeInBytes ?? undefined,
        renderId,
        bucketName
      }
    }
    opts.onProgress?.(Math.round((progress.overallProgress || 0) * 100))
    await sleep(2000)
  }
}

function renderKey(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
