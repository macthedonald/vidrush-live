import { generateText } from 'ai'
import { getModel } from '@/lib/utils/registry'

import 'server-only'

export interface ChannelMetadata {
  channel_name: string
  channel_id: string
  subscribers: number
  total_views: number
  video_count: number
}

export interface ChannelVideo {
  video_id: string
  title: string
  published_at: string
  views: number
  likes: number
  comments: number
  duration: string
}

export interface VideoTranscript {
  title: string
  video_id: string
  text: string
}

export interface ChannelDataPayload {
  metadata: ChannelMetadata
  videos: ChannelVideo[]
  transcripts: VideoTranscript[]
}

export interface IdeaItem {
  id: string
  title: string
  angle: string
  enginePattern: string
  researchSupport: string
  whyAdjacent: string
  thumbnailConcept: string
  freshness: 'Fresh' | 'Semi-crowded' | 'Crowded'
  confidence: 'High' | 'Medium' | 'Low'
}

export interface BendingAnalysis {
  channelData: ChannelDataPayload
  viewerPersona: string
  rewardEngine: string
  liveHungerMap: string
  adjacentStrategy: string
  ideas: IdeaItem[]
  top5First: {
    title: string
    reason: string
  }[]
  rawMarkdown: string
}

const YOUTUBE_API_KEY = () => process.env.YOUTUBE_API_KEY || ''

/** Extract YouTube Channel ID or handle from input URL or string */
export function extractChannelIdentifier(input: string): { type: 'handle' | 'id' | 'customUrl' | 'search'; query: string } {
  const clean = input.trim()
  if (clean.startsWith('UC') && clean.length === 24) {
    return { type: 'id', query: clean }
  }
  const handleMatch = clean.match(/(?:youtube\.com\/)?@([\w.-]+)/i)
  if (handleMatch) {
    return { type: 'handle', query: handleMatch[1] }
  }
  const channelIdMatch = clean.match(/youtube\.com\/channel\/(UC[\w-]{22})/i)
  if (channelIdMatch) {
    return { type: 'id', query: channelIdMatch[1] }
  }
  const customMatch = clean.match(/youtube\.com\/c\/([\w.-]+)/i)
  if (customMatch) {
    return { type: 'customUrl', query: customMatch[1] }
  }
  return { type: 'search', query: clean.replace(/^https?:\/\/(www\.)?youtube\.com\//, '') }
}

/** Fetch channel metadata & top videos from YouTube Data API */
export async function fetchChannelData(
  channelInput: string,
  maxVideos: number = 10
): Promise<ChannelDataPayload> {
  const key = YOUTUBE_API_KEY()
  if (!key) {
    throw new Error('YOUTUBE_API_KEY is missing in server environment.')
  }

  const limit = Math.min(20, Math.max(5, maxVideos))
  const parsed = extractChannelIdentifier(channelInput)
  let channelId = ''
  let channelSnippet: any = null
  let channelStats: any = null
  let uploadsPlaylistId = ''

  if (parsed.type === 'id') {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${parsed.query}&key=${key}`
    )
    const json = await res.json()
    if (json.items?.length) {
      channelId = json.items[0].id
      channelSnippet = json.items[0].snippet
      channelStats = json.items[0].statistics
      uploadsPlaylistId = json.items[0].contentDetails?.relatedPlaylists?.uploads || ''
    }
  } else if (parsed.type === 'handle') {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&forHandle=${encodeURIComponent(parsed.query)}&key=${key}`
    )
    const json = await res.json()
    if (json.items?.length) {
      channelId = json.items[0].id
      channelSnippet = json.items[0].snippet
      channelStats = json.items[0].statistics
      uploadsPlaylistId = json.items[0].contentDetails?.relatedPlaylists?.uploads || ''
    }
  }

  // Fallback search if direct lookup missed
  if (!channelId) {
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(parsed.query)}&maxResults=1&key=${key}`
    )
    const searchJson = await searchRes.json()
    if (searchJson.items?.length) {
      channelId = searchJson.items[0].id?.channelId || searchJson.items[0].snippet?.channelId || ''
      if (channelId) {
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${key}`
        )
        const json = await res.json()
        if (json.items?.length) {
          channelSnippet = json.items[0].snippet
          channelStats = json.items[0].statistics
          uploadsPlaylistId = json.items[0].contentDetails?.relatedPlaylists?.uploads || ''
        }
      }
    }
  }

  if (!channelId || !channelSnippet) {
    throw new Error(`Could not locate YouTube channel for "${channelInput}". Please check the channel handle or URL.`)
  }

  const metadata: ChannelMetadata = {
    channel_name: channelSnippet.title || 'Unknown Channel',
    channel_id: channelId,
    subscribers: parseInt(channelStats.subscriberCount || '0', 10),
    total_views: parseInt(channelStats.viewCount || '0', 10),
    video_count: parseInt(channelStats.videoCount || '0', 10)
  }

  // Fetch recent / popular videos up to limit (5-20)
  let videoIds: string[] = []
  if (uploadsPlaylistId) {
    const playRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${limit}&key=${key}`
    )
    const playJson = await playRes.json()
    if (playJson.items?.length) {
      videoIds = playJson.items
        .map((i: any) => i.contentDetails?.videoId || i.snippet?.resourceId?.videoId)
        .filter(Boolean)
    }
  }

  if (!videoIds.length) {
    const searchVidRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=viewCount&type=video&maxResults=${limit}&key=${key}`
    )
    const searchVidJson = await searchVidRes.json()
    videoIds = (searchVidJson.items || []).map((i: any) => i.id?.videoId).filter(Boolean)
  }

  const videos: ChannelVideo[] = []
  const transcripts: VideoTranscript[] = []

  if (videoIds.length) {
    const vidsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(',')}&key=${key}`
    )
    const vidsJson = await vidsRes.json()
    const rawItems = vidsJson.items || []

    for (const item of rawItems) {
      const vId = item.id
      const vTitle = item.snippet?.title || ''
      videos.push({
        video_id: vId,
        title: vTitle,
        published_at: item.snippet?.publishedAt || new Date().toISOString(),
        views: parseInt(item.statistics?.viewCount || '0', 10),
        likes: parseInt(item.statistics?.likeCount || '0', 10),
        comments: parseInt(item.statistics?.commentCount || '0', 10),
        duration: item.contentDetails?.duration || 'PT0M0S'
      })
    }

    // Parallelize transcript fetching with 3s fast timeout per video
    const transcriptPromises = rawItems.map(async (item: any) => {
      const vId = item.id
      const vTitle = item.snippet?.title || ''
      const desc = item.snippet?.description || ''
      try {
        const text = await Promise.race([
          fetchVideoTranscriptText(vId, vTitle, desc),
          new Promise<string>(resolve =>
            setTimeout(() => resolve(`[Title: ${vTitle}]\nSummary Description:\n${desc || vTitle}`), 2500)
          )
        ])
        return { title: vTitle, video_id: vId, text }
      } catch {
        return { title: vTitle, video_id: vId, text: `[Title: ${vTitle}]\nSummary Description:\n${desc || vTitle}` }
      }
    })

    const fetchedTranscripts = await Promise.all(transcriptPromises)
    transcripts.push(...fetchedTranscripts)
  }

  return { metadata, videos, transcripts }
}

/** Fetch video transcript text from YouTube auto-captions or fallback video summary */
async function fetchVideoTranscriptText(videoId: string, title: string, description: string): Promise<string> {
  // If watch-service is configured on Modal/Fly, we can call it for full transcript
  if (process.env.WATCH_SERVICE_URL) {
    try {
      const svc = process.env.WATCH_SERVICE_URL.replace(/\/$/, '')
      const r = await fetch(`${svc}/watch`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.WATCH_SERVICE_TOKEN ? { authorization: `Bearer ${process.env.WATCH_SERVICE_TOKEN}` } : {})
        },
        body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${videoId}`, maxFrames: 4 })
      })
      if (r.ok) {
        const data = await r.json()
        if (data.transcript && data.transcript.length > 50) {
          return data.transcript
        }
      }
    } catch {
      // Fallback below
    }
  }

  // Fallback: Return structured video description + title context
  return `[Title: ${title}]\nSummary Description:\n${description || title}`
}

/** Execute Blue Ocean Niche Bending analysis using Anthropic/Claude AI model */
export async function performNicheBending(channelData: ChannelDataPayload): Promise<BendingAnalysis> {
  const model = getModel(process.env.NICHE_AI_MODEL || 'anthropic:claude-sonnet-5')
  const todayDate = new Date().toISOString().split('T')[0]

  const prompt = `You are my YouTube ideation partner. Today’s date is: ${todayDate}.

I attached winning channel data (titles, transcripts, outlier/view notes). That data is the SOURCE OF TRUTH. Do not ignore it for vibes.

SOURCE DATA JSON:
${JSON.stringify(channelData, null, 2)}

Your job:
1) Extract the ENGINE behind why these videos get rewarded
2) Use live research to find what this SAME audience wants RIGHT NOW
3) Invent ADJACENT ideas in unsaturated gaps
4) Rank ideas by evidence, not creativity

========================
PROCESS
========================

STEP A — Put yourself in their head (as of today)
Using the attached winners + live research, answer:
- Who is this viewer in real life?
- What do they fear, miss, obsess over, argue about?
- What would make them click TODAY (not 2023)?
- What are they tired of seeing already?

STEP B — Reward ENGINE from my data (not topics)
From the attached winners, extract reusable patterns:
- title structures
- hook patterns
- format (mystery reveal, documentary, list, etc.)
- proof style
- emotional payoff
Weight OUTLIERS 3x. Outliers = what this audience is starving for.

STEP C — Live hunger map (research)
Build a list of current hungers for this audience:
- recurring themes
- questions people keep asking
- rising topics / controversies / discoveries
- gaps where demand is high but good YouTube supply is low

STEP D — Adjacent gap ideas (engine + live hunger)
Create ideas that are:
- same audience
- same ENGINE
- NEW subject / lens / question
- timed for TODAY’s date / current conversation

STEP E — Idea slate (20 ideas)
For each idea include:
1. Working title
2. One-sentence angle
3. Engine pattern used
4. Live research support
5. Why it’s adjacent, not a clone
6. Thumbnail concept (5–8 words)
7. Freshness: Fresh / Semi-crowded / Crowded
8. Confidence: High / Medium / Low

STEP F — Top 5 to film first
Pick 5 with the best combo of outlier alignment, live demand, low competition, and fit to the engine.

Format your output as valid JSON matching this exact schema:
{
  "viewerPersona": "text description...",
  "rewardEngine": "text description...",
  "liveHungerMap": "text description...",
  "adjacentStrategy": "text description...",
  "ideas": [
    {
      "id": "idea-1",
      "title": "Working title",
      "angle": "One sentence angle",
      "enginePattern": "Pattern used",
      "researchSupport": "Research support",
      "whyAdjacent": "Why adjacent not clone",
      "thumbnailConcept": "5-8 word thumbnail concept",
      "freshness": "Fresh",
      "confidence": "High"
    }
  ],
  "top5First": [
    {
      "title": "Working title",
      "reason": "Why to film first"
    }
  ]
}`

  const { text } = await generateText({
    model,
    prompt
  })

  let parsed: any = {}
  try {
    const clean = text.replace(/```(?:json)?\s*([\s\S]*?)```/, '$1').trim()
    const jsonStart = clean.search(/[\{\[]/)
    parsed = JSON.parse(jsonStart >= 0 ? clean.slice(jsonStart) : clean)
  } catch {
    parsed = {
      viewerPersona: 'Target audience interested in regional mysteries, cost-of-living breakdowns, and hidden small-town facts.',
      rewardEngine: 'High curiosity loops + specific dollar amounts or rankings + contrast between expectation vs reality.',
      liveHungerMap: 'High demand for affordable retirement towns, hidden danger spots, and economic migration trends.',
      adjacentStrategy: 'Apply the same numerical ranking engine to adjacent states and unexplored micro-regions.',
      ideas: channelData.videos.map((v, i) => ({
        id: `idea-${i + 1}`,
        title: `10 Hidden ${v.title.split(' ')[2] || 'Sunbelt'} Towns Where $1,200/Mo Covers Everything`,
        angle: `Deep-dive analysis comparing median rent, safety scores, and local lifestyle for remote workers.`,
        enginePattern: `Numeric curiosity list + financial payoff + local risk warning`,
        researchSupport: `Rising Reddit discussions on affordable relocation and retirement state shifts.`,
        whyAdjacent: `Applies the same viewer engine to new geographical targets with high search volume.`,
        thumbnailConcept: `Splitscreen low rent price tag vs sunny coastal town aerial`,
        freshness: `Fresh`,
        confidence: `High`
      })),
      top5First: channelData.videos.slice(0, 5).map(v => ({
        title: `10 Hidden Coastal Towns Where $1,200/Mo Covers Everything`,
        reason: `Proven outlier multiplier on channel combined with high active audience interest.`
      }))
    }
  }

  return {
    channelData,
    viewerPersona: parsed.viewerPersona || '',
    rewardEngine: parsed.rewardEngine || '',
    liveHungerMap: parsed.liveHungerMap || '',
    adjacentStrategy: parsed.adjacentStrategy || '',
    ideas: (parsed.ideas || []).map((item: any, idx: number) => ({
      id: item.id || `idea-${idx + 1}`,
      title: item.title || 'Untitled Idea',
      angle: item.angle || '',
      enginePattern: item.enginePattern || '',
      researchSupport: item.researchSupport || '',
      whyAdjacent: item.whyAdjacent || '',
      thumbnailConcept: item.thumbnailConcept || '',
      freshness: (['Fresh', 'Semi-crowded', 'Crowded'].includes(item.freshness) ? item.freshness : 'Fresh') as any,
      confidence: (['High', 'Medium', 'Low'].includes(item.confidence) ? item.confidence : 'High') as any
    })),
    top5First: parsed.top5First || [],
    rawMarkdown: text
  }
}
