import { NicheBendingTool } from '@/components/niche-bending-tool'

export const metadata = {
  title: 'Niche Bender Engine — Kakkao'
}

export default function NicheBenderPage() {
  return (
    <div className="w-full max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card/80 via-card/40 to-muted/20 p-6 md:p-8 backdrop-blur-xl shadow-xl">
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            ⚡ YouTube Channel Reverse-Engineering
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground">
            Niche Bender
          </h1>
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
            Extract winning channel metadata, video performance, and transcripts. Reverse-engineer
            the audience reward engine and generate 20 Blue Ocean video ideas in unsaturated gaps.
          </p>
        </div>
      </div>

      <NicheBendingTool />
    </div>
  )
}
