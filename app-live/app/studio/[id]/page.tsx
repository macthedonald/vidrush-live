import { notFound } from 'next/navigation'

import { kvGetJSON } from '@/lib/engine/kv'

import { StudioCanvas } from '@/components/studio-canvas'

import type { StoryboardInput } from '@/remotion/schema'

// /studio/[id] — the full Remotion canvas for a storyboard published by composeRender.
// The Render button here fires a Remotion Lambda render (see components/studio-canvas.tsx).
export default async function StudioPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const storyboard = await kvGetJSON<StoryboardInput>(`storyboard:${id}`)
  if (!storyboard) notFound()
  return <StudioCanvas id={id} storyboard={storyboard} />
}
