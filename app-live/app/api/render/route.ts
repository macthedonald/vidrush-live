import { NextResponse } from 'next/server'

import { kvGetJSON } from '@/lib/engine/kv'
import {
  getLambdaProgress,
  isLambdaConfigured,
  startLambdaRender
} from '@/lib/remotion/lambda'

import type { StoryboardInput } from '@/remotion/schema'

// Node runtime — @remotion/lambda bundles the AWS SDK.
export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/render { id }  → start a Remotion Lambda render of the stored storyboard.
// Returns { renderId, bucketName } to poll with GET.
export async function POST(req: Request) {
  if (!isLambdaConfigured()) {
    return NextResponse.json(
      {
        error:
          'Remotion Lambda is not configured. Set REMOTION_SERVE_URL + AWS credentials (see docs/REMOTION_LAMBDA.md).'
      },
      { status: 400 }
    )
  }
  let body: { id?: string; inputProps?: StoryboardInput }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const inputProps =
    body.inputProps ||
    (body.id ? await kvGetJSON<StoryboardInput>(`storyboard:${body.id}`) : null)
  if (!inputProps) {
    return NextResponse.json(
      { error: 'storyboard not found (expired or bad id)' },
      { status: 404 }
    )
  }
  try {
    const handle = await startLambdaRender(inputProps)
    return NextResponse.json(handle)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'render start failed' },
      { status: 500 }
    )
  }
}

// GET /api/render?renderId=…&bucketName=…  → poll render progress.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const renderId = searchParams.get('renderId')
  const bucketName = searchParams.get('bucketName')
  if (!renderId || !bucketName) {
    return NextResponse.json(
      { error: 'renderId and bucketName are required' },
      { status: 400 }
    )
  }
  try {
    const progress = await getLambdaProgress({ renderId, bucketName })
    return NextResponse.json(progress)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'progress check failed' },
      { status: 500 }
    )
  }
}
