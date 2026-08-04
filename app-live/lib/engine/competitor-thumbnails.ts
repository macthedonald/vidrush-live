// Competitor thumbnail reference — pull the top-performing thumbnails off a YouTube
// channel so the thumbnail generator can match a niche's proven visual language instead
// of inventing one. Server-only: the YouTube Data API key never reaches the browser.
//
// Falls back to scraping the channel page when YOUTUBE_API_KEY is absent, mirroring what
// lib/niche/bending.ts already does for channel stats.
import { extractChannelIdentifier } from '@/lib/niche/bending'

const YT = 'https://www.googleapis.com/youtube/v3'

export interface CompetitorThumbnail {
  videoId: string
  title: string
  thumbnailUrl: string
  views?: number
}

function ytKey(): string {
  return process.env.YOUTUBE_API_KEY || process.env.YT_API_KEY || ''
}

async function ytApi(
  ep: string,
  params: Record<string, string>,
  signal?: AbortSignal
): Promise<any> {
  const r = await fetch(
    `${YT}/${ep}?${new URLSearchParams({ ...params, key: ytKey() })}`,
    { signal }
  )
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.error?.message || `YouTube API ${r.status}`)
  }
  return r.json()
}

// Resolve a handle / URL / channel id / bare name to a UC… channel id.
async function resolveChannelId(
  input: string,
  signal?: AbortSignal
): Promise<string> {
  const parsed = extractChannelIdentifier(input)
  if (parsed.type === 'id') return parsed.query

  if (parsed.type === 'handle') {
    // forHandle is the cheap, exact lookup; search is the fallback when it misses.
    const d = await ytApi(
      'channels',
      { part: 'id', forHandle: `@${parsed.query}` },
      signal
    ).catch(() => null)
    const id = d?.items?.[0]?.id
    if (id) return id
  }

  const s = await ytApi(
    'search',
    { part: 'snippet', type: 'channel', maxResults: '1', q: parsed.query },
    signal
  )
  const id = s?.items?.[0]?.snippet?.channelId || s?.items?.[0]?.id?.channelId
  if (!id) throw new Error(`no YouTube channel found for "${input}"`)
  return id
}

function bestThumb(thumbs: any): string | undefined {
  return (
    thumbs?.maxres?.url ||
    thumbs?.standard?.url ||
    thumbs?.high?.url ||
    thumbs?.medium?.url ||
    thumbs?.default?.url
  )
}

// Scrape the channel's video grid when no API key is configured. Thumbnail URLs follow a
// fixed pattern off the video id, so we only need the ids.
async function scrapeTopThumbnails(
  channelInput: string,
  limit: number,
  signal?: AbortSignal
): Promise<CompetitorThumbnail[]> {
  const parsed = extractChannelIdentifier(channelInput)
  const url =
    parsed.type === 'id'
      ? `https://www.youtube.com/channel/${parsed.query}/videos`
      : `https://www.youtube.com/@${encodeURIComponent(parsed.query)}/videos`

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    signal
  })
  const html = await res.text()

  const seen = new Set<string>()
  const out: CompetitorThumbnail[] = []
  const re = /"videoId":"([\w-]{11})"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && out.length < limit) {
    if (seen.has(m[1])) continue
    seen.add(m[1])
    out.push({
      videoId: m[1],
      title: '',
      // hqdefault always exists; maxresdefault 404s on plenty of uploads.
      thumbnailUrl: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`
    })
  }
  if (!out.length) throw new Error(`could not read videos for "${channelInput}"`)
  return out
}

/**
 * Top-performing thumbnails from a competitor channel, most-viewed first.
 * `channel` accepts a handle (@name), channel URL, UC… id, or plain channel name.
 */
export async function getCompetitorThumbnails(
  channel: string,
  opts: { limit?: number; signal?: AbortSignal } = {}
): Promise<CompetitorThumbnail[]> {
  const limit = Math.max(1, Math.min(opts.limit || 3, 10))
  const input = (channel || '').trim()
  if (!input) throw new Error('no competitor channel given')

  if (!ytKey()) {
    return scrapeTopThumbnails(input, limit, opts.signal)
  }

  try {
    const channelId = await resolveChannelId(input, opts.signal)
    const search = await ytApi(
      'search',
      {
        part: 'snippet',
        channelId,
        type: 'video',
        order: 'viewCount',
        maxResults: String(limit)
      },
      opts.signal
    )
    const items: any[] = search?.items || []
    const out = items
      .map(it => ({
        videoId: it.id?.videoId as string,
        title: (it.snippet?.title as string) || '',
        thumbnailUrl:
          bestThumb(it.snippet?.thumbnails) ||
          (it.id?.videoId
            ? `https://i.ytimg.com/vi/${it.id.videoId}/hqdefault.jpg`
            : '')
      }))
      .filter(v => v.videoId && v.thumbnailUrl)
    if (!out.length) throw new Error('channel returned no videos')
    return out
  } catch (error) {
    console.warn(
      `[CompetitorThumbnails] API lookup failed for "${input}", scraping instead:`,
      error
    )
    return scrapeTopThumbnails(input, limit, opts.signal)
  }
}
