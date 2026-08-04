import { ThumbnailStudio } from '@/components/thumbnail-studio'

export const metadata = {
  title: 'Thumbnail Studio — nano-banana-pro — Kakkao'
}

export default function ThumbnailsPage() {
  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-8 space-y-6">
      {/* Header banner, matching the Avatars / Niche tool pages */}
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card/80 via-card/40 to-muted/20 p-6 md:p-8 backdrop-blur-xl shadow-xl">
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              🖼️ nano-banana-pro
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-mono text-muted-foreground">
              16:9 · via AI33
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground">
            Thumbnail Studio
          </h1>

          <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
            Design click-worthy YouTube thumbnails without leaving the studio.
            Describe the shot, add your own reference images, and pull a
            competitor&apos;s top-performing thumbnails to borrow their visual
            language — then render variants side by side and pick the winner.
          </p>
        </div>
      </div>

      <ThumbnailStudio />
    </div>
  )
}
