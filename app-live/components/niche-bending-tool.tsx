'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  IconArrowRight,
  IconBrain,
  IconCheck,
  IconCode,
  IconCompass,
  IconCopy,
  IconFlame,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconTarget,
  IconTrendingUp,
  IconUsers,
  IconVideo
} from '@tabler/icons-react'

import { cn } from '@/lib/utils'
import type { BendingAnalysis, IdeaItem } from '@/lib/niche/bending'

export function NicheBendingTool() {
  const router = useRouter()
  const [channelUrl, setChannelUrl] = useState('')
  const [maxVideos, setMaxVideos] = useState<number>(10)
  const [loading, setLoading] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [analysis, setAnalysis] = useState<BendingAnalysis | null>(null)
  const [showJsonModal, setShowJsonModal] = useState(false)
  const [copied, setCopied] = useState(false)

  const runBending = async () => {
    const input = channelUrl.trim()
    if (!input) {
      setErrorMessage('Please enter a YouTube channel handle or URL (e.g. @TexasKnows)')
      return
    }

    setLoading(true)
    setErrorMessage('')
    setStatusText('Resolving channel metadata & parallelizing video transcripts…')

    try {
      const res = await fetch('/api/niche', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'bend',
          channelUrl: input,
          maxVideos
        })
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Niche Bending request failed')
      }

      setAnalysis(json.data)
      setStatusText('✅ Blue Ocean Niche Analysis complete!')
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      setErrorMessage(err.includes('Failed to fetch') ? 'Network connection timed out. Please retry.' : err)
      setStatusText('')
    } finally {
      setLoading(false)
    }
  }

  const copyJson = () => {
    if (!analysis?.channelData) return
    navigator.clipboard.writeText(JSON.stringify(analysis.channelData, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const startChatWithIdea = (idea: IdeaItem) => {
    const prompt = `I want to create a video based on this niche-bending idea:\n\nTitle: ${idea.title}\nAngle: ${idea.angle}\nEngine Pattern: ${idea.enginePattern}\nThumbnail Concept: ${idea.thumbnailConcept}\n\nPlease research the topic, write a high-retention script, cut beats, and generate a storyboard.`
    const encoded = encodeURIComponent(prompt)
    router.push(`/?prompt=${encoded}`)
  }

  return (
    <div className="space-y-6">
      {/* Search & Control Card */}
      <div className="rounded-2xl border border-border bg-card p-5 md:p-6 shadow-md backdrop-blur-md space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="relative flex-1">
            <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              className="h-11 w-full rounded-xl border border-border bg-background/80 pl-10 pr-4 text-sm font-medium transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Enter YouTube Channel handle or URL (e.g. @TexasKnows)..."
              value={channelUrl}
              onChange={e => setChannelUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runBending()}
            />
          </div>

          <button
            onClick={runBending}
            disabled={loading}
            className="h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition disabled:opacity-50"
          >
            <IconSparkles className="h-4 w-4" />
            {loading ? 'Analyzing…' : 'Bend Niche'}
          </button>
        </div>

        {/* Competitor Videos Slider & Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-border/40">
          <div className="flex flex-wrap items-center gap-4 flex-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <IconVideo className="h-4 w-4 text-primary" />
              <span>Competitor Videos to Analyze:</span>
              <span className="font-mono font-bold text-foreground text-sm px-2 py-0.5 rounded-lg border border-border bg-muted/40">
                {maxVideos}
              </span>
            </div>

            <div className="flex items-center gap-3 flex-1 min-w-[200px] max-w-xs">
              <input
                type="range"
                min={5}
                max={20}
                step={1}
                value={maxVideos}
                onChange={e => setMaxVideos(Number(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary"
              />
            </div>

            <div className="flex items-center gap-1.5">
              {[5, 10, 15, 20].map(n => (
                <button
                  key={n}
                  onClick={() => setMaxVideos(n)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-bold transition',
                    maxVideos === n
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-background/80 text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading / Status Banner */}
        {statusText && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-400">
            {loading && <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />}
            <span>{statusText}</span>
          </div>
        )}

        {/* Error Banner with Retry Button */}
        {errorMessage && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
            <div className="space-y-0.5">
              <span className="font-bold block">Analysis Failed</span>
              <p className="opacity-90">{errorMessage}</p>
            </div>
            <button
              onClick={runBending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-destructive-foreground hover:bg-destructive/90 transition shrink-0"
            >
              <IconRefresh className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}
      </div>

      {/* Results Display */}
      {analysis && (
        <div className="space-y-6">
          {/* Channel Metadata & JSON Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-lg backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary font-black text-lg border border-primary/20">
                {analysis.channelData.metadata.channel_name.charAt(0)}
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {analysis.channelData.metadata.channel_name}
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span>
                    <b className="text-foreground">{analysis.channelData.metadata.subscribers.toLocaleString()}</b> subs
                  </span>
                  <span>·</span>
                  <span>
                    <b className="text-foreground">{analysis.channelData.metadata.total_views.toLocaleString()}</b> total views
                  </span>
                  <span>·</span>
                  <span>
                    <b className="text-foreground">{analysis.channelData.videos.length}</b> videos analyzed
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowJsonModal(!showJsonModal)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted transition"
              >
                <IconCode className="h-3.5 w-3.5" /> {showJsonModal ? 'Hide JSON' : 'View JSON'}
              </button>
              <button
                onClick={copyJson}
                className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition"
              >
                {copied ? <IconCheck className="h-3.5 w-3.5" /> : <IconCopy className="h-3.5 w-3.5" />}
                {copied ? 'Copied!' : 'Copy JSON'}
              </button>
            </div>
          </div>

          {/* JSON Inspection View */}
          {showJsonModal && (
            <div className="rounded-2xl border border-border bg-card p-4 font-mono text-xs text-emerald-400 overflow-x-auto max-h-96">
              <pre>{JSON.stringify(analysis.channelData, null, 2)}</pre>
            </div>
          )}

          {/* Blue Ocean Analysis Insights Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                <IconUsers className="h-4 w-4" /> STEP A — Viewer Persona
              </div>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                {analysis.viewerPersona}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
                <IconFlame className="h-4 w-4" /> STEP B — Reward Engine
              </div>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                {analysis.rewardEngine}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                <IconTrendingUp className="h-4 w-4" /> STEP C — Live Hunger Map
              </div>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                {analysis.liveHungerMap}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-400">
                <IconCompass className="h-4 w-4" /> STEP D — Adjacent Strategy
              </div>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                {analysis.adjacentStrategy}
              </p>
            </div>
          </div>

          {/* Top 5 Recommendations Highlight */}
          {analysis.top5First.length > 0 && (
            <div className="rounded-3xl border border-amber-500/30 bg-card p-6 space-y-4">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-amber-400">
                <IconTarget className="h-5 w-5" /> STEP F — Top 5 Ideas to Film First
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {analysis.top5First.map((item, idx) => (
                  <div key={idx} className="rounded-2xl border border-border bg-muted/20 p-4 space-y-2 flex flex-col justify-between">
                    <div>
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                        #{idx + 1} Priority
                      </span>
                      <h4 className="text-sm font-bold text-foreground mt-1.5 leading-snug">
                        {item.title}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {item.reason}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 20 Idea Slate Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <IconBrain className="h-5 w-5 text-primary" /> STEP E — 20 Blue Ocean Ideas Slate
              </h3>
              <span className="text-xs text-muted-foreground">
                Ranked by evidence & engine fit
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analysis.ideas.map((idea, idx) => (
                <div
                  key={idea.id || idx}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 space-y-3 transition-all duration-300 hover:border-primary/50 hover:shadow-xl flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Idea #{idx + 1}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-bold',
                            idea.freshness === 'Fresh'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-amber-500/15 text-amber-400'
                          )}
                        >
                          {idea.freshness}
                        </span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-bold',
                            idea.confidence === 'High'
                              ? 'bg-primary/15 text-primary'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {idea.confidence} Confidence
                        </span>
                      </div>
                    </div>

                    <h4 className="text-base font-bold text-foreground group-hover:text-primary transition-colors leading-snug">
                      {idea.title}
                    </h4>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      <strong className="text-foreground font-semibold">Angle: </strong>
                      {idea.angle}
                    </p>

                    <div className="space-y-1 text-xs text-muted-foreground/90">
                      <div>
                        <strong className="text-foreground font-medium">Engine Pattern: </strong>
                        {idea.enginePattern}
                      </div>
                      <div>
                        <strong className="text-foreground font-medium">Thumbnail Concept: </strong>
                        <span className="italic">{idea.thumbnailConcept}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border/40 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                      {idea.whyAdjacent}
                    </span>
                    <button
                      onClick={() => startChatWithIdea(idea)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition shrink-0"
                    >
                      Generate Video <IconArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
