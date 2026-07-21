import { NextResponse } from 'next/server'
import { generateTalkingAvatar } from '@/lib/engine/avatar'

// Test audio track (short 3-second spoken audio sample)
const SAMPLE_AUDIO_URL =
  'https://raw.githubusercontent.com/TencentARC/GFPGAN/master/inputs/audio.wav'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { avatarImageUrl, bboxShift, textPrompt } = body

    if (!avatarImageUrl) {
      return NextResponse.json(
        { error: 'Avatar image URL is required for testing' },
        { status: 400 }
      )
    }

    const result = await generateTalkingAvatar({
      audioUrl: SAMPLE_AUDIO_URL,
      avatarImageUrl,
      bboxShift: Number(bboxShift) || 0
    })

    return NextResponse.json({
      success: true,
      videoUrl: result.videoUrl,
      durationSec: result.durationSec,
      model: result.model,
      isModalHosted: result.isModalHosted
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to generate avatar test' },
      { status: 500 }
    )
  }
}
