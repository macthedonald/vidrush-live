'use client'

// The Studio canvas — the entire Remotion composition shown large (the same <Storyboard>
// that Lambda renders), with a Render button that fires a Remotion Lambda render and shows
// live progress, then the finished MP4. Reached at /studio/[id] once composeRender publishes
// a storyboard.
import { useCallback, useEffect, useRef, useState } from 'react'

import { Player, type PlayerRef } from '@remotion/player'

import { durationInFrames, type StoryboardInput } from '@/remotion/schema'
import { Storyboard } from '@/remotion/Storyboard'

type Status = 'idle' | 'rendering' | 'done' | 'error'

export function StudioCanvas({
  id,
  storyboard
}: {
  id: string
  storyboard: StoryboardInput
}) {
  const frames = durationInFrames(storyboard)
  const playerRef = useRef<PlayerRef>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState(0)
  const [videoUrl, setVideoUrl] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()

  useEffect(
    () => () => {
      if (pollRef.current) clearTimeout(pollRef.current)
    },
    []
  )

  const render = useCallback(async () => {
    setStatus('rendering')
    setProgress(0)
    setError(undefined)
    setVideoUrl(undefined)
    try {
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start render')
      const { renderId, bucketName } = data as {
        renderId: string
        bucketName: string
      }
      const poll = async () => {
        const r = await fetch(
          `/api/render?renderId=${encodeURIComponent(renderId)}&bucketName=${encodeURIComponent(bucketName)}`
        )
        const p = await r.json()
        if (!r.ok) throw new Error(p.error || 'Progress check failed')
        setProgress(p.progress ?? 0)
        if (p.error) {
          setStatus('error')
          setError(p.error)
          return
        }
        if (p.done) {
          setStatus('done')
          setVideoUrl(p.url)
          return
        }
        pollRef.current = setTimeout(poll, 2000)
      }
      poll()
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [id])

  const rendering = status === 'rendering'

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 md:p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Kakkao Studio</h1>
          <p className="text-sm text-muted-foreground">
            {storyboard.shots.length} shots · {storyboard.width}×
            {storyboard.height} · {storyboard.fps}fps
          </p>
        </div>
        <div className="flex items-center gap-3">
          {status === 'done' && videoUrl && (
            <a
              href={videoUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Download MP4
            </a>
          )}
          <button
            onClick={render}
            disabled={rendering}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {rendering ? `Rendering… ${progress}%` : 'Render on Lambda'}
          </button>
        </div>
      </header>

      {/* The full Remotion canvas. */}
      <div className="overflow-hidden rounded-lg border border-border bg-black">
        <Player
          ref={playerRef}
          component={Storyboard}
          inputProps={storyboard}
          durationInFrames={frames}
          fps={storyboard.fps}
          compositionWidth={storyboard.width}
          compositionHeight={storyboard.height}
          style={{ width: '100%' }}
          controls
          acknowledgeRemotionLicense
        />
      </div>

      {rendering && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {status === 'done' && videoUrl && (
        <video
          controls
          preload="metadata"
          src={videoUrl}
          className="w-full rounded-lg bg-black"
        />
      )}
      {status === 'error' && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export default StudioCanvas
