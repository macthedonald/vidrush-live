import { NextResponse } from 'next/server'

import { nicheVerdicts, suggestSubNiches } from '@/lib/niche/ai'
import { analyzeKeyword } from '@/lib/niche/analyze'
import { fetchChannelData, performNicheBending } from '@/lib/niche/bending'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/niche — one endpoint, four actions:
//   { action: 'analyze', keyword, days?, region?, format? } → NicheResult
//   { action: 'suggest', topic } → string[]
//   { action: 'verdicts', summary } → Record<keyword, verdict>
//   { action: 'bend', channelUrl } → BendingAnalysis
export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  try {
    switch (body.action) {
      case 'analyze': {
        if (!body.keyword)
          return NextResponse.json({ error: 'keyword required' }, { status: 400 })
        const data = await analyzeKeyword(String(body.keyword), {
          days: Number(body.days) || 90,
          region: String(body.region || 'US'),
          format: body.format === 'shorts' ? 'shorts' : 'long'
        })
        return NextResponse.json({ data })
      }
      case 'suggest': {
        if (!body.topic)
          return NextResponse.json({ error: 'topic required' }, { status: 400 })
        const keywords = await suggestSubNiches(String(body.topic))
        return NextResponse.json({ keywords })
      }
      case 'verdicts': {
        const verdicts = await nicheVerdicts(String(body.summary || ''))
        return NextResponse.json({ verdicts })
      }
      case 'bend': {
        if (!body.channelUrl)
          return NextResponse.json({ error: 'channelUrl required' }, { status: 400 })
        const maxVid = Math.min(20, Math.max(5, Number(body.maxVideos) || 10))
        const channelData = await fetchChannelData(String(body.channelUrl), maxVid)
        const analysis = await performNicheBending(channelData)
        return NextResponse.json({ data: analysis })
      }
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'niche request failed' },
      { status: 500 }
    )
  }
}
