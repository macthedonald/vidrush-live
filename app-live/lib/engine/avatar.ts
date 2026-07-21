// Kakkao engine — MuseTalk Talking Avatar (A-roll) synthesis hosted on Modal.com
// Accepts a narration audio track (or voiceoverId) and an avatar portrait image URL.
// Synthesizes a real-time audio-driven talking presenter video with lip synchronization.

import { kvGetJSON } from '@/lib/engine/kv'

export interface AvatarOptions {
  audioUrl?: string
  voiceoverId?: string
  avatarImageUrl?: string
  avatarStyle?: string
  bboxShift?: number
  fps?: number
  abortSignal?: AbortSignal
}

export interface AvatarResult {
  videoUrl: string
  durationSec: number
  avatarImageUrl: string
  model: string
  status: 'success' | 'fallback'
  isModalHosted: boolean
}

// Default high-quality AI presenter portrait
const DEFAULT_AVATAR_PORTRAIT =
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80'

export async function generateTalkingAvatar(
  options: AvatarOptions
): Promise<AvatarResult> {
  let audioUrl = options.audioUrl

  // Retrieve audio URL from KV voiceover handle if voiceoverId was provided
  if (!audioUrl && options.voiceoverId) {
    const handle = await kvGetJSON<{ audioUrl?: string; durationSec?: number }>(
      `voiceover:${options.voiceoverId}`
    )
    if (handle?.audioUrl) {
      audioUrl = handle.audioUrl
    }
  }

  if (!audioUrl) {
    throw new Error('Either audioUrl or a valid voiceoverId is required to generate a talking avatar.')
  }

  const avatarImageUrl = options.avatarImageUrl || DEFAULT_AVATAR_PORTRAIT
  const bboxShift = options.bboxShift ?? 0
  const fps = options.fps ?? 25

  // Check for Modal MuseTalk endpoint URL in environment variables
  const modalEndpoint =
    process.env.AVATAR_SERVICE_URL || process.env.MUSETALK_SERVICE_URL

  if (modalEndpoint) {
    try {
      const baseUrl = modalEndpoint.replace(/\/$/, '')
      const targetUrl = baseUrl.endsWith('/generate_avatar')
        ? baseUrl
        : `${baseUrl}/generate_avatar`

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          audio_url: audioUrl,
          avatar_image_url: avatarImageUrl,
          bbox_shift: bboxShift,
          fps
        }),
        signal: options.abortSignal
      })

      if (res.ok) {
        const data = await res.json()
        if (data.video_url || data.videoUrl) {
          return {
            videoUrl: data.video_url || data.videoUrl,
            durationSec: Number(data.duration) || 5.0,
            avatarImageUrl,
            model: data.model || 'MuseTalk-v1.0 (Modal)',
            status: 'success',
            isModalHosted: true
          }
        }
      }
    } catch (error) {
      console.warn('[AvatarEngine] Modal MuseTalk call failed, using high-quality presenter fallback:', error)
    }
  }

  // Graceful Fallback: Return presenter image asset URL if Modal URL is unconfigured or unavailable
  return {
    videoUrl: avatarImageUrl,
    durationSec: 5.0,
    avatarImageUrl,
    model: 'MuseTalk (Fallback Image Asset)',
    status: 'fallback',
    isModalHosted: false
  }
}
