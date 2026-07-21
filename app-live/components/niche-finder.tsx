'use client'

import { useState } from 'react'
import {
  IconAlertCircle,
  IconArrowUpRight,
  IconChartBar,
  IconCheck,
  IconClock,
  IconEye,
  IconFlame,
  IconGlobe,
  IconPlus,
  IconSearch,
  IconSparkles,
  IconTarget,
  IconTrendingUp,
  IconUsers,
  IconVideo,
  IconX
} from '@tabler/icons-react'

import { cn } from '@/lib/utils'

interface NicheVideo {
  id: string
  title: string
  thumb?: string
  channel?: string
  views: number
  subs: number
  multiple: number
}

interface BreakoutChannel {
  id: string
  name: string
  thumb?: string
  subs: number
  best: number
  ratio: number
}

interface NicheResult {
  kw: string
  format: 'long' | 'shorts'
  score: number
  demand: number
  opportunity: number
  velocity: number
  competition: number
  engagement: number
  avgViews: number
  avgVpd: number
  channels: number
  smallWinners: number
  outliers: NicheVideo[]
  breakout: BreakoutChannel[]
}

type Entry =
  | { status: 'loading' }
  | { status: 'error'; err: string }
  | { status: 'done'; data: NicheResult }

const fmt = (n: number) =>
  n >= 1e6
    ? (n / 1e6).toFixed(1) + 'M'
    : n >= 1e3
      ? (n / 1e3).toFixed(0) + 'K'
      : String(Math.round(n))

const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase())

async function api(body: unknown) {
  const r = await fetch('/api/niche', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

function ScoreGauge({ score }: { score: number }) {
  const isHot = score >= 70
  const isWorkable = score >= 45

  const toneColor = isHot
    ? 'text-emerald-400 dark:text-emerald-400'
    : isWorkable
      ? 'text-amber-400 dark:text-amber-400'
      : 'text-rose-400 dark:text-rose-400'

  const bgGradient = isHot
    ? 'from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/20'
    : isWorkable
      ? 'from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/20'
      : 'from-rose-500/10 via-rose-500/5 to-transparent border-rose-500/20'

  const barColor = isHot
    ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
    : isWorkable
      ? 'bg-gradient-to-r from-amber-500 to-orange-400 shadow-[0_0_12px_rgba(245,158,11,0.4)]'
      : 'bg-gradient-to-r from-rose-500 to-pink-500 shadow-[0_0_12px_rgba(244,63,94,0.4)]'

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-gradient-to-b p-5 text-center backdrop-blur-md transition-all duration-300',
        bgGradient
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Niche Opportunity Score
        </span>
        {isHot ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
            <IconFlame className="h-3 w-3" /> Hot Niche
          </span>
        ) : isWorkable ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">
            <IconTrendingUp className="h-3 w-3" /> Workable
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-400">
            <IconAlertCircle className="h-3 w-3" /> Saturated
          </span>
        )}
      </div>

      <div className="my-4 flex items-baseline justify-center gap-1">
        <span className={cn('text-5xl font-black tracking-tight', toneColor)}>
          {score}
        </span>
        <span className="text-sm font-bold text-muted-foreground">/ 100</span>
      </div>

      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/50">
        <div
          className={cn('h-full rounded-full transition-all duration-700 ease-out', barColor)}
          style={{ width: `${score}%` }}
        />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {isHot
          ? 'High demand with clear small channel winner potential.'
          : isWorkable
            ? 'Moderate competition; requires strong visual hooks.'
            : 'High competition density or low audience demand.'}
      </p>
    </div>
  )
}

function MetricBar({
  label,
  value,
  bad = false
}: {
  label: string
  value: number
  bad?: boolean
}) {
  return (
    <div className="group flex items-center justify-between gap-3 text-xs">
      <span className="w-24 shrink-0 text-[11px] font-semibold text-muted-foreground transition-colors group-hover:text-foreground">
        {label}
      </span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted/60">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            bad
              ? 'bg-gradient-to-r from-amber-500 to-rose-500'
              : 'bg-gradient-to-r from-primary to-indigo-500'
          )}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right font-mono text-xs font-bold text-foreground">
        {value}
      </span>
    </div>
  )
}

export function NicheFinder() {
  const [seed, setSeed] = useState('')
  const [kws, setKws] = useState<string[]>([])
  const [days, setDays] = useState(90)
  const [region, setRegion] = useState('US')
  const [format, setFormat] = useState<'long' | 'shorts'>('long')
  const [results, setResults] = useState<Record<string, Entry>>({})
  const [verdicts, setVerdicts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [st, setSt] = useState('')

  const addKw = (k?: string) => {
    const v = (k ?? seed).trim().toLowerCase()
    if (v && !kws.includes(v)) setKws(prev => [...prev, v])
    setSeed('')
  }

  const suggest = async () => {
    if (!seed.trim()) {
      setSt('⚠ Type a broad topic first, e.g. “history”, “finance”, “true crime”')
      return
    }
    setSuggesting(true)
    setSt('Analyzing AI sub-niches…')
    try {
      const { keywords } = await api({ action: 'suggest', topic: seed.trim() })
      setKws(prev => [...new Set([...prev, ...keywords])])
      setSt(`✅ ${keywords.length} sub-niches generated — click Analyze`)
    } catch (e) {
      setSt('⚠ ' + (e instanceof Error ? e.message : String(e)))
    }
    setSuggesting(false)
  }

  const analyze = async () => {
    if (!kws.length) {
      setSt('⚠ Add at least one keyword to analyze')
      return
    }
    setBusy(true)
    const doneData: NicheResult[] = []
    for (let i = 0; i < kws.length; i++) {
      const kw = kws[i]
      setSt(`Analyzing ${i + 1}/${kws.length}: “${kw}”…`)
      setResults(prev => ({ ...prev, [kw]: { status: 'loading' } }))
      try {
        const { data } = await api({ action: 'analyze', keyword: kw, days, region, format })
        doneData.push(data)
        setResults(prev => ({ ...prev, [kw]: { status: 'done', data } }))
      } catch (e) {
        setResults(prev => ({
          ...prev,
          [kw]: { status: 'error', err: e instanceof Error ? e.message : String(e) }
        }))
      }
    }
    setSt('✅ Analysis complete!')
    setBusy(false)
    if (doneData.length) {
      try {
        const summary = doneData
          .map(
            r =>
              `${r.kw}: score ${r.score}, avg views ${fmt(r.avgViews)}, ${r.smallWinners} small channels winning, competition ${r.competition}%`
          )
          .join('\n')
        const { verdicts: v } = await api({ action: 'verdicts', summary })
        setVerdicts(prev => ({ ...prev, ...v }))
      } catch {
        /* verdicts are best-effort */
      }
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card/80 via-card/40 to-muted/20 p-6 md:p-8 backdrop-blur-xl shadow-xl">
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <IconSparkles className="h-3.5 w-3.5" /> Live YouTube Market Intelligence
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground">
            Niche Finder
          </h1>
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
            Validate YouTube niches before creating a single video. Score real-time demand,
            small-channel win probability, upload velocity, and competitor saturation.
          </p>
        </div>
      </div>

      {/* Control Card */}
      <div className="rounded-2xl border border-border bg-card p-5 md:p-6 shadow-md backdrop-blur-md space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="relative flex-1">
            <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              className="h-11 w-full rounded-xl border border-border bg-background/80 pl-10 pr-4 text-sm font-medium transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Enter niche keyword (e.g. ancient rome mysteries) or broad topic for AI..."
              value={seed}
              onChange={e => setSeed(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addKw()}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => addKw()}
              className="h-11 inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-4 text-sm font-semibold hover:bg-muted transition"
            >
              <IconPlus className="h-4 w-4" /> Add
            </button>
            <button
              onClick={suggest}
              disabled={suggesting}
              className="h-11 inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-semibold text-primary hover:bg-primary/20 transition disabled:opacity-60"
            >
              <IconSparkles className="h-4 w-4" /> {suggesting ? 'Ideating…' : 'AI Sub-niches'}
            </button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/40">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground">
              <IconVideo className="h-3.5 w-3.5" />
              <select
                className="bg-transparent text-foreground focus:outline-none cursor-pointer"
                value={format}
                onChange={e => setFormat(e.target.value as 'long' | 'shorts')}
              >
                <option value="long">Long-form Videos</option>
                <option value="shorts">YouTube Shorts</option>
              </select>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground">
              <IconClock className="h-3.5 w-3.5" />
              <select
                className="bg-transparent text-foreground focus:outline-none cursor-pointer"
                value={days}
                onChange={e => setDays(+e.target.value)}
              >
                <option value={30}>Last 30 Days</option>
                <option value={90}>Last 90 Days</option>
                <option value={180}>Last 180 Days</option>
              </select>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground">
              <IconGlobe className="h-3.5 w-3.5" />
              <select
                className="bg-transparent text-foreground focus:outline-none cursor-pointer"
                value={region}
                onChange={e => setRegion(e.target.value)}
              >
                {['US', 'GB', 'CA', 'AU', 'IN', 'DE', 'BR', 'NG'].map(r => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={analyze}
            disabled={busy || !kws.length}
            className="h-11 w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 transition disabled:opacity-50"
          >
            <IconTarget className="h-4 w-4" />
            {busy ? 'Analyzing Niches…' : `Analyze ${kws.length ? `${kws.length} ` : ''}Niche${kws.length === 1 ? '' : 's'}`}
          </button>
        </div>

        {/* Selected Keyword Tags */}
        {kws.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {kws.map((k, i) => {
              const e = results[k]
              return (
                <span
                  key={k}
                  className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-muted/60 px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/40"
                >
                  <span>{k}</span>
                  {e?.status === 'done' && (
                    <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                      {e.data.score}/100
                    </span>
                  )}
                  <button
                    onClick={() => setKws(kws.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-foreground transition"
                  >
                    <IconX className="h-3.5 w-3.5" />
                  </button>
                </span>
              )
            })}
          </div>
        )}

        {/* Status Message */}
        {st && (
          <div
            className={cn(
              'rounded-xl border p-3 text-xs font-medium transition-all',
              st[0] === '⚠'
                ? 'border-destructive/20 bg-destructive/10 text-destructive'
                : st[0] === '✅'
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                  : 'border-border bg-muted/30 text-muted-foreground'
            )}
          >
            {st}
          </div>
        )}
      </div>

      {/* Results List */}
      <div className="space-y-6">
        {kws
          .filter(k => results[k])
          .map(kw => {
            const e = results[kw]
            if (e.status === 'loading') {
              return (
                <div
                  key={kw}
                  className="flex items-center justify-center gap-3 rounded-2xl border border-border/60 bg-card/40 p-8 text-sm text-muted-foreground backdrop-blur-md"
                >
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  Scanning YouTube market data for “{kw}”…
                </div>
              )
            }
            if (e.status === 'error') {
              return (
                <div
                  key={kw}
                  className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive"
                >
                  <div className="flex items-center gap-2 font-semibold">
                    <IconAlertCircle className="h-4 w-4" /> {kw} Analysis Error
                  </div>
                  <p className="mt-1 text-xs opacity-90">{e.err}</p>
                </div>
              )
            }

            const d = e.data
            return (
              <div
                key={kw}
                className="overflow-hidden rounded-3xl border border-border bg-card p-6 md:p-8 shadow-xl backdrop-blur-xl space-y-6"
              >
                {/* Header & Score Gauge */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                  <div className="lg:col-span-2 space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-2xl font-black tracking-tight text-foreground">
                        {titleCase(d.kw)}
                      </h3>
                      <span className="rounded-lg border border-border bg-muted px-2.5 py-1 text-[11px] font-bold uppercase text-muted-foreground">
                        {d.format === 'shorts' ? 'Shorts' : 'Long-form'}
                      </span>
                    </div>

                    {verdicts[d.kw] && (
                      <div className="rounded-xl border-l-4 border-primary bg-primary/5 p-4 text-xs md:text-sm leading-relaxed text-muted-foreground">
                        <strong className="block text-foreground font-semibold mb-1">
                          AI Strategic Verdict:
                        </strong>
                        {verdicts[d.kw]}
                      </div>
                    )}

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                      <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                        <div className="text-[10px] font-bold uppercase text-muted-foreground">
                          Avg Views
                        </div>
                        <div className="text-lg font-bold text-foreground mt-0.5">
                          {fmt(d.avgViews)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                        <div className="text-[10px] font-bold uppercase text-muted-foreground">
                          Daily Velocity
                        </div>
                        <div className="text-lg font-bold text-foreground mt-0.5">
                          {fmt(d.avgVpd)}/d
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                        <div className="text-[10px] font-bold uppercase text-muted-foreground">
                          Small Winners
                        </div>
                        <div className="text-lg font-bold text-emerald-400 mt-0.5">
                          {d.smallWinners}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                        <div className="text-[10px] font-bold uppercase text-muted-foreground">
                          Engagement
                        </div>
                        <div className="text-lg font-bold text-primary mt-0.5">
                          {(d.engagement * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    {/* Metric Bars */}
                    <div className="space-y-2.5 pt-3 max-w-lg">
                      <MetricBar label="Demand" value={d.demand} />
                      <MetricBar label="Opportunity" value={d.opportunity} />
                      <MetricBar label="Velocity" value={d.velocity} />
                      <MetricBar label="Competition" value={d.competition} bad />
                    </div>
                  </div>

                  <div className="lg:col-span-1">
                    <ScoreGauge score={d.score} />
                  </div>
                </div>

                {/* Outlier Videos Section */}
                {d.outliers.length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-border/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        <IconFlame className="h-4 w-4 text-amber-500" /> Outlier Videos (Small Channels, High Views)
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {d.outliers.slice(0, 4).map(v => (
                        <a
                          key={v.id}
                          href={`https://youtube.com/watch?v=${v.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="group relative overflow-hidden rounded-2xl border border-border bg-card/60 transition-all duration-300 hover:border-primary/60 hover:shadow-xl"
                        >
                          {v.thumb && (
                            <div className="relative aspect-video w-full overflow-hidden bg-muted">
                              <img
                                src={v.thumb}
                                alt={v.title}
                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                              <span className="absolute right-2 top-2 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-black text-white shadow-md">
                                {v.multiple.toFixed(0)}x Outlier
                              </span>
                            </div>
                          )}
                          <div className="p-3.5 space-y-1.5">
                            <h4 className="line-clamp-2 text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                              {v.title}
                            </h4>
                            <p className="text-[11px] text-muted-foreground">
                              <span className="font-semibold text-foreground">{fmt(v.views)}</span> views · {v.channel} ({fmt(v.subs)} subs)
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Breakout Channels Section */}
                {d.breakout.length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-border/40">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <IconTrendingUp className="h-4 w-4 text-emerald-400" /> Breakout Channels
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {d.breakout.map(c => (
                        <a
                          key={c.id}
                          href={`https://youtube.com/channel/${c.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="group flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/20 p-3.5 transition-all hover:border-primary/50 hover:bg-muted/40"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {c.thumb && (
                              <img
                                src={c.thumb}
                                alt={c.name}
                                className="h-10 w-10 shrink-0 rounded-full object-cover border border-border"
                              />
                            )}
                            <div className="min-w-0">
                              <div className="truncate text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                                {c.name}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {fmt(c.subs)} subs · best {fmt(c.best)}
                              </div>
                            </div>
                          </div>
                          <span className="shrink-0 rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-400">
                            {c.ratio.toFixed(0)}x
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}

export default NicheFinder
