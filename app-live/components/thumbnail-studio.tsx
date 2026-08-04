'use client'

import { useCallback, useRef, useState } from 'react'

import {
  IconDownload as Download,
  IconLink as LinkIcon,
  IconLoader2 as Loader,
  IconSearch as Search,
  IconSparkles as Sparkles,
  IconUpload as Upload,
  IconX as X
} from '@tabler/icons-react'

import { MAX_THUMBNAIL_REFS } from '@/lib/engine/thumbnail-prompt'

import { Button } from '@/components/ui/button'

interface CompetitorThumb {
  videoId: string
  title: string
  thumbnailUrl: string
}

interface GeneratedThumb {
  imageUrl: string
  model: string
}

// Uploads ride to the server as data URLs inside the JSON body, so they have to stay
// small — a serverless request body is capped in the low megabytes. 1280px wide is more
// than nano-banana-pro needs from a reference anyway.
const MAX_REF_WIDTH = 1280
const JPEG_QUALITY = 0.85

function downscaleToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`could not read ${file.name}`))
    reader.onload = () => {
      const img = new window.Image()
      img.onerror = () => reject(new Error(`${file.name} is not a readable image`))
      img.onload = () => {
        const scale = Math.min(1, MAX_REF_WIDTH / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('canvas unavailable'))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

export function ThumbnailStudio() {
  const [concept, setConcept] = useState('')
  const [titleText, setTitleText] = useState('')
  const [count, setCount] = useState(2)

  // References the user brings: uploaded files (as data URLs) and pasted image URLs.
  const [userRefs, setUserRefs] = useState<string[]>([])
  const [urlDraft, setUrlDraft] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  // Competitor references: fetched first so they can be reviewed before spending a render.
  const [channel, setChannel] = useState('')
  const [competitors, setCompetitors] = useState<CompetitorThumb[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [loadingCompetitors, setLoadingCompetitors] = useState(false)

  const [results, setResults] = useState<GeneratedThumb[]>([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const pickedUrls = competitors
    .filter(c => picked.has(c.videoId))
    .map(c => c.thumbnailUrl)
  const refSlotsUsed = userRefs.length + pickedUrls.length
  const refsFull = refSlotsUsed >= MAX_THUMBNAIL_REFS

  const addFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return
      setError(null)
      const room = MAX_THUMBNAIL_REFS - userRefs.length
      if (room <= 0) {
        setError(`You can use at most ${MAX_THUMBNAIL_REFS} reference images.`)
        return
      }
      try {
        const added = await Promise.all(
          Array.from(files)
            .filter(f => f.type.startsWith('image/'))
            .slice(0, room)
            .map(downscaleToDataUrl)
        )
        setUserRefs(prev => [...prev, ...added].slice(0, MAX_THUMBNAIL_REFS))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'could not read that image')
      }
    },
    [userRefs.length]
  )

  const addUrl = () => {
    const url = urlDraft.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) {
      setError('Reference URLs must start with http:// or https://')
      return
    }
    setError(null)
    setUserRefs(prev => [...prev, url].slice(0, MAX_THUMBNAIL_REFS))
    setUrlDraft('')
  }

  const loadCompetitors = async () => {
    const c = channel.trim()
    if (!c) return
    setLoadingCompetitors(true)
    setError(null)
    setCompetitors([])
    setPicked(new Set())
    try {
      const res = await fetch('/api/thumbnail', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'competitors', channel: c, limit: 6 })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'could not load that channel')
      setCompetitors(data.thumbnails || [])
      if (!data.thumbnails?.length) {
        setNotice('That channel returned no videos.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'competitor lookup failed')
    } finally {
      setLoadingCompetitors(false)
    }
  }

  const togglePick = (videoId: string) => {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(videoId)) {
        next.delete(videoId)
      } else if (userRefs.length + next.size < MAX_THUMBNAIL_REFS) {
        next.add(videoId)
      }
      return next
    })
  }

  const generate = async () => {
    if (!concept.trim()) {
      setError('Describe the thumbnail you want first.')
      return
    }
    setGenerating(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/thumbnail', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          concept,
          titleText: titleText.trim() || undefined,
          referenceImageUrls: userRefs,
          competitorImageUrls: pickedUrls,
          count
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'generation failed')
      setResults(prev => [...(data.images || []), ...prev])
      if (data.failed) {
        setNotice(
          `${data.failed} of ${data.failed + (data.images?.length || 0)} variants failed; showing the ones that landed.`
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'generation failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      {/* ── Controls ─────────────────────────────────────────────── */}
      <div className="space-y-5">
        <section className="rounded-2xl border border-border/60 bg-card/60 p-4 space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Thumbnail concept
          </label>
          <textarea
            value={concept}
            onChange={e => setConcept(e.target.value)}
            rows={4}
            placeholder="A shocked developer staring at a wall of red error logs, neon glow on their face, dark server room behind them"
            className="w-full resize-y rounded-lg border border-border/60 bg-background/70 p-3 text-sm outline-none focus:border-primary/60"
          />

          <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Overlay text (optional)
          </label>
          <input
            value={titleText}
            onChange={e => setTitleText(e.target.value)}
            placeholder="IT ALL BROKE"
            className="w-full rounded-lg border border-border/60 bg-background/70 p-2.5 text-sm outline-none focus:border-primary/60"
          />
          <p className="text-xs text-muted-foreground">
            2–5 words works best. nano-banana-pro renders text crisply.
          </p>

          <div className="flex items-center gap-3 pt-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Variants
            </label>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={`size-8 rounded-md border text-sm transition ${
                    count === n
                      ? 'border-primary bg-primary/15 text-primary font-semibold'
                      : 'border-border/60 text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Your references */}
        <section className="rounded-2xl border border-border/60 bg-card/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Your references</h2>
            <span className="text-xs text-muted-foreground">
              {refSlotsUsed}/{MAX_THUMBNAIL_REFS} slots
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            A face, product, logo or a thumbnail you like. These keep the subject
            and branding consistent.
          </p>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInput.current?.click()}
              disabled={userRefs.length >= MAX_THUMBNAIL_REFS}
            >
              <Upload className="size-4 mr-1.5" />
              Upload
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={e => {
                void addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>

          <div className="flex gap-2">
            <input
              value={urlDraft}
              onChange={e => setUrlDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addUrl()
                }
              }}
              placeholder="…or paste an image URL"
              className="flex-1 rounded-lg border border-border/60 bg-background/70 px-2.5 py-2 text-sm outline-none focus:border-primary/60"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={addUrl}
              disabled={!urlDraft.trim() || userRefs.length >= MAX_THUMBNAIL_REFS}
            >
              <LinkIcon className="size-4" />
            </Button>
          </div>

          {userRefs.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {userRefs.map((src, i) => (
                <div
                  key={`${src.slice(0, 32)}-${i}`}
                  className="group relative aspect-video overflow-hidden rounded-md border border-border/60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Reference ${i + 1}`}
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setUserRefs(prev => prev.filter((_, j) => j !== i))
                    }
                    aria-label={`Remove reference ${i + 1}`}
                    className="absolute right-1 top-1 rounded bg-background/80 p-0.5 opacity-0 transition group-hover:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Competitor references */}
        <section className="rounded-2xl border border-border/60 bg-card/60 p-4 space-y-3">
          <h2 className="text-sm font-semibold">Competitor style</h2>
          <p className="text-xs text-muted-foreground">
            Pull a channel&apos;s top-performing thumbnails and borrow their visual
            language — composition, grading, text weight. Never their subject or
            wording.
          </p>

          <div className="flex gap-2">
            <input
              value={channel}
              onChange={e => setChannel(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void loadCompetitors()
                }
              }}
              placeholder="@mkbhd, a channel URL, or a channel name"
              className="flex-1 rounded-lg border border-border/60 bg-background/70 px-2.5 py-2 text-sm outline-none focus:border-primary/60"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadCompetitors()}
              disabled={loadingCompetitors || !channel.trim()}
            >
              {loadingCompetitors ? (
                <Loader className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
            </Button>
          </div>

          {competitors.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground">
                Tap to use as a style reference
                {refsFull && ' — reference slots are full'}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {competitors.map(c => {
                  const on = picked.has(c.videoId)
                  return (
                    <button
                      key={c.videoId}
                      type="button"
                      onClick={() => togglePick(c.videoId)}
                      title={c.title || c.videoId}
                      className={`relative aspect-video overflow-hidden rounded-md border-2 transition ${
                        on
                          ? 'border-primary ring-2 ring-primary/30'
                          : 'border-transparent hover:border-primary/40'
                      } ${!on && refsFull ? 'opacity-40' : ''}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={c.thumbnailUrl}
                        alt={c.title || 'Competitor thumbnail'}
                        className="size-full object-cover"
                      />
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </section>

        <Button
          onClick={() => void generate()}
          disabled={generating || !concept.trim()}
          className="w-full"
          size="lg"
        >
          {generating ? (
            <>
              <Loader className="size-4 mr-2 animate-spin" />
              Rendering {count > 1 ? `${count} variants` : 'thumbnail'}…
            </>
          ) : (
            <>
              <Sparkles className="size-4 mr-2" />
              Generate
            </>
          )}
        </Button>

        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && !error && (
          <p className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
            {notice}
          </p>
        )}
      </div>

      {/* ── Results ──────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Results{results.length > 0 && ` (${results.length})`}
          </h2>
          {results.length > 0 && (
            <button
              type="button"
              onClick={() => setResults([])}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        {results.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/60 p-8 text-center">
            <Sparkles className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {generating
                ? 'nano-banana-pro is rendering — this takes up to a minute.'
                : 'Your thumbnails will appear here.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {results.map((r, i) => (
              <figure
                key={`${r.imageUrl}-${i}`}
                className="group overflow-hidden rounded-xl border border-border/60 bg-card/60"
              >
                <div className="relative aspect-video">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.imageUrl}
                    alt={`Generated thumbnail ${i + 1}`}
                    className="size-full object-cover"
                  />
                </div>
                <figcaption className="flex items-center justify-between gap-2 p-2.5">
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {r.model}
                  </span>
                  <a
                    href={r.imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    download
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs hover:border-primary/50"
                  >
                    <Download className="size-3.5" />
                    Open
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
