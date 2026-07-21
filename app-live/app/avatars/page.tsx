import { AvatarManager } from '@/components/avatar-manager'

export const metadata = {
  title: 'Presenter Avatars — MuseTalk A-Roll — Kakkao'
}

export default function AvatarsPage() {
  return (
    <div className="w-full max-w-6xl mx-auto p-4 md:p-8 space-y-6">
      {/* Header Glassmorphism Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card/80 via-card/40 to-muted/20 p-6 md:p-8 backdrop-blur-xl shadow-xl">
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              🎭 MuseTalk Talking Avatar Engine
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-mono text-muted-foreground">
              Hosted on Modal GPU
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground">
            Presenter Avatars
          </h1>

          <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
            Manage your AI talking avatars for video script presenter shots (A-roll). Select preset hosts or upload custom presenter portraits, test live lip-synchronization powered by Modal GPU, and integrate seamlessly into video generation.
          </p>
        </div>
      </div>

      {/* Main Avatar Manager */}
      <AvatarManager />
    </div>
  )
}
