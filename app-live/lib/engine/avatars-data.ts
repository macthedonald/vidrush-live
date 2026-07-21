import { kvGetJSON, kvSetJSON } from '@/lib/engine/kv'

export interface AvatarProfile {
  id: string
  name: string
  role: string
  description: string
  imageUrl: string
  bboxShift: number
  isPreset?: boolean
  createdAt: string
  voiceName?: string
}

export const PRESET_AVATARS: AvatarProfile[] = [
  {
    id: 'avatar-tech-alex',
    name: 'Alex Rivera',
    role: 'Tech & Product Host',
    description: 'Modern, engaging tech anchor ideal for reviews, software breakdowns, and product reveals.',
    imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
    bboxShift: 0,
    isPreset: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    voiceName: 'en-US-Neural2-F'
  },
  {
    id: 'avatar-doc-elena',
    name: 'Elena Rostova',
    role: 'Documentary Narrator',
    description: 'Deep, mysterious, and captivating presenter for investigative mini-docs and history breakdowns.',
    imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
    bboxShift: 0,
    isPreset: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    voiceName: 'en-US-Journey-F'
  },
  {
    id: 'avatar-finance-marcus',
    name: 'Marcus Vance',
    role: 'Finance & Business Analyst',
    description: 'Authoritative, sharp, executive presenter for market breakdowns, crypto, and real estate.',
    imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80',
    bboxShift: 0,
    isPreset: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    voiceName: 'en-US-Neural2-D'
  },
  {
    id: 'avatar-story-sophia',
    name: 'Sophia Chen',
    role: 'Lifestyle & Storyteller',
    description: 'Warm, relatable, expressive presenter for vlogs, life hacks, and storytelling channels.',
    imageUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
    bboxShift: 0,
    isPreset: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    voiceName: 'en-US-News-K'
  }
]

const KV_AVATARS_KEY = 'avatars:custom_list'

export async function getAvatars(): Promise<AvatarProfile[]> {
  const custom = await kvGetJSON<AvatarProfile[]>(KV_AVATARS_KEY)
  const userList = custom || []
  return [...PRESET_AVATARS, ...userList]
}

export async function saveAvatar(avatar: Omit<AvatarProfile, 'id' | 'createdAt'> & { id?: string }): Promise<AvatarProfile> {
  const existing = await kvGetJSON<AvatarProfile[]>(KV_AVATARS_KEY) || []
  
  const id = avatar.id || `avatar-${Date.now()}`
  const newProfile: AvatarProfile = {
    ...avatar,
    id,
    isPreset: false,
    createdAt: new Date().toISOString()
  }

  const index = existing.findIndex(a => a.id === id)
  if (index >= 0) {
    existing[index] = newProfile
  } else {
    existing.unshift(newProfile)
  }

  await kvSetJSON(KV_AVATARS_KEY, existing, 60 * 60 * 24 * 365) // 1 year TTL
  return newProfile
}

export async function deleteAvatar(id: string): Promise<boolean> {
  const existing = await kvGetJSON<AvatarProfile[]>(KV_AVATARS_KEY) || []
  const filtered = existing.filter(a => a.id !== id)
  if (filtered.length !== existing.length) {
    await kvSetJSON(KV_AVATARS_KEY, filtered, 60 * 60 * 24 * 365)
    return true
  }
  return false
}
