import { NextResponse } from 'next/server'
import { getAvatars, saveAvatar, deleteAvatar } from '@/lib/engine/avatars-data'

export async function GET() {
  try {
    const avatars = await getAvatars()
    return NextResponse.json({ avatars })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch avatars' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body.name || !body.imageUrl) {
      return NextResponse.json(
        { error: 'Avatar name and image URL are required' },
        { status: 400 }
      )
    }

    const avatar = await saveAvatar({
      id: body.id,
      name: body.name,
      role: body.role || 'Custom Presenter',
      description: body.description || 'Custom AI presenter avatar.',
      imageUrl: body.imageUrl,
      bboxShift: Number(body.bboxShift) || 0,
      voiceName: body.voiceName || 'en-US-Neural2-F'
    })

    return NextResponse.json({ avatar, success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to save avatar' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const cleanUrl = (req.url || '').replace(/^[\uFEFF\u200B\s]+|[\uFEFF\u200B\s]+$/g, '').trim()
    const { searchParams } = new URL(cleanUrl || 'http://localhost/api/avatar')
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Avatar ID is required' }, { status: 400 })
    }

    const success = await deleteAvatar(id)
    return NextResponse.json({ success })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to delete avatar' },
      { status: 500 }
    )
  }
}
