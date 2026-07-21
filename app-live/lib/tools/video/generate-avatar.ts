import { tool } from 'ai'
import { z } from 'zod'

import { generateTalkingAvatar } from '@/lib/engine/avatar'
import { kvSetJSON } from '@/lib/engine/kv'

const avatarSchema = z.object({
  voiceoverId: z
    .string()
    .optional()
    .describe(
      'Voiceover handle from generateVoiceover — its audio track drives the avatar lip-sync'
    ),
  audioUrl: z
    .string()
    .optional()
    .describe('Public HTTP(S) URL of the narration audio track (wav/mp3)'),
  avatarImageUrl: z
    .string()
    .optional()
    .describe(
      'Public HTTP(S) URL of a custom avatar portrait / face image to animate'
    ),
  avatarStyle: z
    .string()
    .optional()
    .describe(
      'Description of presenter avatar style (e.g. "tech host", "news anchor", "documentary narrator")'
    ),
  bboxShift: z
    .number()
    .optional()
    .describe('Bounding box shift for lip alignment tuning (default 0)')
})

export interface AvatarHandle {
  avatarId: string
  videoUrl: string
  durationSec: number
  avatarImageUrl: string
  model: string
  isModalHosted: boolean
}

// Generate a talking presenter / avatar video (A-roll) using MuseTalk hosted on Modal.
// Takes a voiceoverId or audioUrl and synthesizes a synchronized video of the avatar speaking.
export function createGenerateAvatarTool() {
  return tool({
    description:
      'Generate a talking presenter / avatar video (A-roll) driven by narration audio using MuseTalk (hosted on Modal). Takes a voiceoverId or audioUrl and an avatar image/portrait. Returns a synchronized talking avatar video URL (MP4) that can be used as a shot\'s `src` (with kind "video" or "avatar") in composeRender for A-roll presenter scenes.',
    inputSchema: avatarSchema,
    execute: async (
      { voiceoverId, audioUrl, avatarImageUrl, avatarStyle, bboxShift },
      { abortSignal }
    ) => {
      const result = await generateTalkingAvatar({
        voiceoverId,
        audioUrl,
        avatarImageUrl,
        avatarStyle,
        bboxShift,
        abortSignal
      })

      const avatarId = `av_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      const handle: AvatarHandle = {
        avatarId,
        videoUrl: result.videoUrl,
        durationSec: result.durationSec,
        avatarImageUrl: result.avatarImageUrl,
        model: result.model,
        isModalHosted: result.isModalHosted
      }

      await kvSetJSON(`avatar:${avatarId}`, handle)

      return {
        state: 'complete' as const,
        ...handle
      }
    }
  })
}
