'use client'

// Kakkao Niche Finder — the one standalone tool. Scores niches on live YouTube data
// (demand / opportunity / velocity / competition → 0-100) with AI sub-niche ideation and
// per-niche verdicts. All API keys are server-side (YOUTUBE_API_KEY, ANTHROPIC via the
// model registry); this calls /api/niche.
import { useState } from 'react'

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
  if (!r.ok) throw new Error(d.error || 'request failed')
  return d
}

function ScoreGauge({ score }: { score: number }) {
  const tone =
    score >= 70
      ? 'text-green-500'
      : score >= 45
        ? 'text-amber-500'
        : 'text-muted-foreground'
  const bar =
    score >= 70 ? 'bg-green-500' : score >= 45 ? 'bg-amber-500' : 'bg-muted-foreground'
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
      <div className={cn('text-4xl font-extrabold tracking-tight', tone)}>
        {score}
        <span className="text-sm font-semibold text-muted-foreground">/100</span>
      </div>
      <div className="my-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full', bar)} style={{ width: `${score}%` }} />
      </div>
      <div className="text-xs font-medium text-muted-foreground">
        {score >= 70 ? 'Hot niche' : score >= 45 ? 'Workable' : 'Saturated / weak'}
      </div>
    </div>
  )
}

function Bar({ label, v, bad }: { label: string; v: number; bad?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-24 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
        <div
          className={cn('h-full rounded', bad ? 'bg-amber-500' : 'bg-primary')}
          style={{ width: `${v}%` }}
        />
      </div>
      <span className="w-7 text-right font-mono text-[11px] text-muted-foreground">
        {v}
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
    setSt('Finding sub-niches…')
    try {
      const { keywords } = await api({ action: 'suggest', topic: seed.trim() })
      setKws(prev => [...new Set([...prev, ...keywords])])
      setSt(`✅ ${keywords.length} sub-niches suggested — hit Analyze`)
    } catch (e) {
      setSt('⚠ ' + (e instanceof Error ? e.message : String(e)))
    }
    setSuggesting(false)
  }

  const analyze = async () => {
    if (!kws.length) {
      setSt('⚠ Add at least one keyword')
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
    setSt('✅ Analysis complete')
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
    <div className="mx-auto w-full max-w-4xl p-4 md:p-6">
      <h1 className="text-2xl font-bold tracking-tight">Niche Finder</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Score niches on live YouTube data before you invest a single video — demand,
        small-channel opportunity, velocity, and competition. Add keywords or let AI
        suggest sub-niches from a broad topic.
      </p>

      <div className="mt-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="h-9 min-w-[240px] flex-1 rounded-md border border-border bg-background px-3 text-sm"
            placeholder="Niche keyword (e.g. ancient rome mysteries) or a broad topic for AI"
            value={seed}
            onChange={e => setSeed(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addKw()}
          />
          <button
            className="h-9 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
            onClick={() => addKw()}
          >
            + Add
          </button>
          <button
            className="h-9 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-60"
            onClick={suggest}
            disabled={suggesting}
          >
            {suggesting ? '…' : 'AI Sub-niches'}
          </button>
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={format}
            onChange={e => setFormat(e.target.value as 'long' | 'shorts')}
          >
            <option value="long">Long-form</option>
            <option value="shorts">Shorts</option>
          </select>
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={days}
            onChange={e => setDays(+e.target.value)}
          >
            <option value={30}>Last 30d</option>
            <option value={90}>Last 90d</option>
            <option value={180}>Last 180d</option>
          </select>
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={region}
            onChange={e => setRegion(e.target.value)}
          >
            {['US', 'GB', 'CA', 'AU', 'IN', 'DE', 'BR', 'NG'].map(r => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>

        {kws.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {kws.map((k, i) => {
              const e = results[k]
              return (
                <span
                  key={k}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs"
                >
                  {k}
                  {e?.status === 'done' && (
                    <b className="rounded bg-green-500 px-1.5 text-[10px] text-white">
                      {e.data.score}
                    </b>
                  )}
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setKws(kws.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </span>
              )
            })}
          </div>
        )}

        <button
          className="mt-4 h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          onClick={analyze}
          disabled={busy || !kws.length}
        >
          {busy ? 'Analyzing…' : `Analyze ${kws.length || ''} niche${kws.length === 1 ? '' : 's'}`}
        </button>
        <p className="mt-2 text-xs text-muted-foreground">
          Each keyword costs ~102 YouTube API quota units (search 100 + 2 lookups) of your
          10,000/day.
        </p>
        {st && (
          <p
            className={cn(
              'mt-2 text-sm',
              st[0] === '⚠'
                ? 'text-destructive'
                : st[0] === '✅'
                  ? 'text-green-600'
                  : 'text-muted-foreground'
            )}
          >
            {st}
          </p>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {kws
          .filter(k => results[k])
          .map(kw => {
            const e = results[kw]
            if (e.status === 'loading')
              return (
                <div
                  key={kw}
                  className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
                >
                  Scanning “{kw}”…
                </div>
              )
            if (e.status === 'error')
              return (
                <div
                  key={kw}
                  className="rounded-lg border border-border bg-card p-4 text-sm text-destructive"
                >
                  ⚠ {kw}: {e.err}
                </div>
              )
            const d = e.data
            return (
              <div key={kw} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap justify-between gap-6">
                  <div className="min-w-[280px] flex-1">
                    <h3 className="flex items-center gap-2.5 text-xl font-bold tracking-tight">
                      {titleCase(d.kw)}
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                        {d.format === 'shorts' ? 'Shorts' : 'Long-form'}
                      </span>
                    </h3>
                    {verdicts[d.kw] && (
                      <p className="mt-2 rounded-r-md border-l-2 border-primary bg-muted/40 px-3 py-2 text-[13px] leading-relaxed text-muted-foreground">
                        {verdicts[d.kw]}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>
                        <b className="text-foreground">{fmt(d.avgViews)}</b> avg views
                      </span>
                      <span>
                        <b className="text-foreground">{fmt(d.avgVpd)}</b> views/day
                      </span>
                      <span>
                        <b className="text-foreground">{d.channels}</b> channels
                      </span>
                      <span>
                        <b className="text-foreground">{d.smallWinners}</b> small winners
                      </span>
                      <span>
                        <b className="text-foreground">
                          {(d.engagement * 100).toFixed(1)}%
                        </b>{' '}
                        engagement
                      </span>
                    </div>
                    <div className="mt-3 flex max-w-md flex-col gap-1.5">
                      <Bar label="Demand" v={d.demand} />
                      <Bar label="Opportunity" v={d.opportunity} />
                      <Bar label="Velocity" v={d.velocity} />
                      <Bar label="Competition" v={d.competition} bad />
                    </div>
                  </div>
                  <div className="min-w-[200px]">
                    <ScoreGauge score={d.score} />
                  </div>
                </div>

                {d.outliers.length > 0 && (
                  <>
                    <div className="mt-5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Outliers — small channels, huge views
                    </div>
                    <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                      {d.outliers.slice(0, 4).map(v => (
                        <a
                          key={v.id}
                          href={`https://youtube.com/watch?v=${v.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="group relative overflow-hidden rounded-lg border border-border transition hover:border-primary"
                        >
                          { }
                          {v.thumb && (
                            <img
                              src={v.thumb}
                              alt=""
                              className="aspect-video w-full object-cover"
                            />
                          )}
                          <span className="absolute right-1.5 top-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {v.multiple.toFixed(0)}x subs
                          </span>
                          <div className="line-clamp-2 px-2.5 pb-0.5 pt-2 text-xs font-medium">
                            {v.title}
                          </div>
                          <div className="px-2.5 pb-2.5 text-[10px] text-muted-foreground">
                            {fmt(v.views)} views · {v.channel} ({fmt(v.subs)} subs)
                          </div>
                        </a>
                      ))}
                    </div>
                  </>
                )}

                {d.breakout.length > 0 && (
                  <>
                    <div className="mt-5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Breakout channels
                    </div>
                    <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
                      {d.breakout.map(c => (
                        <a
                          key={c.id}
                          href={`https://youtube.com/channel/${c.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 transition hover:border-primary"
                        >
                          { }
                          {c.thumb && (
                            <img src={c.thumb} alt="" className="h-9 w-9 rounded-full" />
                          )}
                          <div>
                            <div className="text-sm font-medium">{c.name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {fmt(c.subs)} subs · best {fmt(c.best)} · {c.ratio.toFixed(0)}x
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}

export default NicheFinder
