// Niche Finder — VidIQ-style opportunity analysis on live YouTube data. For each keyword:
// recent top videos → channel stats → demand / opportunity / velocity / competition metrics
// → 0-100 score + breakout channels + outliers. Server-only: the YouTube Data API key comes
// from the environment (YOUTUBE_API_KEY), never the browser.
import 'server-only'

const YT = 'https://www.googleapis.com/youtube/v3'

export interface NicheVideo {
  id: string
  title: string
  thumb?: string
  channel?: string
  channelId: string
  views: number
  likes: number
  ageDays: number
  vpd: number
  multiple: number
  subs: number
}

export interface BreakoutChannel {
  id: string
  name: string
  thumb?: string
  subs: number
  best: number
  ratio: number
}

export interface NicheResult {
  kw: string
  format: 'long' | 'shorts'
  score: number
  demand: number
  opportunity: number
  velocity: number
  competition: number
  engagement: number
  avgViews: number
  medViews: number
  avgVpd: number
  channels: number
  smallWinners: number
  outliers: NicheVideo[]
  breakout: BreakoutChannel[]
  vids: NicheVideo[]
}

function ytKey(): string {
  const k = process.env.YOUTUBE_API_KEY || process.env.YT_API_KEY || ''
  if (!k) throw new Error('YOUTUBE_API_KEY is not set on the server')
  return k
}

async function ytApi(
  ep: string,
  params: Record<string, string>
): Promise<any> {
  const r = await fetch(
    `${YT}/${ep}?${new URLSearchParams({ ...params, key: ytKey() })}`
  )
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.error?.message || `YouTube API ${r.status}`)
  }
  return r.json()
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

// ISO8601 duration (PT#H#M#S) → seconds.
function isoSec(d: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d || '')
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0
}
const SHORTS_MAX = 183 // Shorts run up to 3 minutes

export async function analyzeKeyword(
  kw: string,
  {
    days = 90,
    region = 'US',
    format = 'long'
  }: { days?: number; region?: string; format?: 'long' | 'shorts' } = {}
): Promise<NicheResult> {
  const publishedAfter = new Date(Date.now() - days * 864e5).toISOString()
  const params: Record<string, string> = {
    part: 'snippet',
    q: kw,
    type: 'video',
    order: 'viewCount',
    publishedAfter,
    maxResults: '25',
    regionCode: region,
    relevanceLanguage: 'en'
  }
  if (format === 'shorts') params.videoDuration = 'short'
  const s = await ytApi('search', params)
  const ids = (s.items || [])
    .map((i: any) => i.id.videoId)
    .filter(Boolean) as string[]
  if (!ids.length) throw new Error('No recent videos found for this keyword')

  const vdAll = await ytApi('videos', {
    part: 'snippet,statistics,contentDetails',
    id: ids.join(',')
  })
  const items = (vdAll.items || []).filter((v: any) => {
    const sec = isoSec(v.contentDetails?.duration)
    return format === 'shorts' ? sec > 0 && sec <= SHORTS_MAX : sec > SHORTS_MAX
  })
  if (!items.length) {
    throw new Error(
      format === 'shorts'
        ? 'No Shorts found for this keyword — try long-form'
        : 'Only Shorts rank for this keyword — try the Shorts filter'
    )
  }

  const chIds = [...new Set(items.map((v: any) => v.snippet.channelId))]
  const cd = await ytApi('channels', {
    part: 'snippet,statistics',
    id: chIds.join(',')
  })
  const chans: Record<string, { id: string; name: string; thumb?: string; subs: number; videoCount: number; totalViews: number }> =
    {}
  ;(cd.items || []).forEach((c: any) => {
    chans[c.id] = {
      id: c.id,
      name: c.snippet.title,
      thumb: c.snippet.thumbnails?.default?.url,
      subs: +(c.statistics.subscriberCount || 0),
      videoCount: +(c.statistics.videoCount || 0),
      totalViews: +(c.statistics.viewCount || 0)
    }
  })

  const vids: NicheVideo[] = items
    .map((v: any) => {
      const views = +(v.statistics.viewCount || 0)
      const likes = +(v.statistics.likeCount || 0)
      const ageDays = Math.max(
        1,
        (Date.now() - new Date(v.snippet.publishedAt).getTime()) / 864e5
      )
      const ch = chans[v.snippet.channelId] || { subs: 0, name: '' }
      return {
        id: v.id,
        title: v.snippet.title,
        thumb: v.snippet.thumbnails?.medium?.url,
        channel: ch.name,
        channelId: v.snippet.channelId,
        views,
        likes,
        ageDays,
        vpd: views / ageDays,
        multiple: views / Math.max(ch.subs, 100),
        subs: ch.subs
      }
    })
    .sort((a: NicheVideo, b: NicheVideo) => b.views - a.views)

  const avgViews = vids.reduce((s2, v) => s2 + v.views, 0) / vids.length
  const medViews = vids[Math.floor(vids.length / 2)].views
  const avgVpd = vids.reduce((s2, v) => s2 + v.vpd, 0) / vids.length
  const engagement =
    vids.reduce((s2, v) => s2 + (v.views ? v.likes / v.views : 0), 0) /
    vids.length
  const chList = Object.values(chans)
  const smallWinners = chList.filter(
    c =>
      c.subs < 100000 &&
      vids.some(v => v.channelId === c.id && v.views > 100000)
  )
  const bigShare = vids.filter(v => v.subs > 1_000_000).length / vids.length
  const outliers = vids.filter(v => v.multiple > 5).slice(0, 8)
  const breakout: BreakoutChannel[] = chList
    .map(c => ({
      id: c.id,
      name: c.name,
      thumb: c.thumb,
      subs: c.subs,
      best: Math.max(
        0,
        ...vids.filter(v => v.channelId === c.id).map(v => v.views)
      ),
      ratio: Math.max(
        0,
        ...vids.filter(v => v.channelId === c.id).map(v => v.multiple)
      )
    }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 6)

  const demand = clamp((Math.log10(Math.max(avgViews, 1)) / 6.5) * 100, 0, 100)
  const opportunity = clamp(
    (smallWinners.length / Math.max(chList.length, 1)) * 250 +
      outliers.length * 5,
    0,
    100
  )
  const velocity = clamp((Math.log10(Math.max(avgVpd, 1)) / 5) * 100, 0, 100)
  const competition = clamp(bigShare * 100, 0, 100)
  const score = Math.round(
    clamp(
      demand * 0.35 +
        opportunity * 0.3 +
        velocity * 0.25 -
        competition * 0.15 +
        engagement * 300,
      1,
      99
    )
  )

  return {
    kw,
    format,
    score,
    demand: Math.round(demand),
    opportunity: Math.round(opportunity),
    velocity: Math.round(velocity),
    competition: Math.round(competition),
    engagement,
    avgViews,
    medViews,
    avgVpd,
    channels: chList.length,
    smallWinners: smallWinners.length,
    outliers,
    breakout,
    vids: vids.slice(0, 6)
  }
}
