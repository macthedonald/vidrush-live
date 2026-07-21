'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'

import {
  IconAlertCircle as AlertCircle,
  IconCheck as Check,
  IconChevronDown as ChevronDown,
  IconMicrophone as Mic,
  IconMovie as Movie,
  IconMusic as Music
} from '@tabler/icons-react'

import { toPublicErrorPayload } from '@/lib/errors/public-error'
import type { ToolPart } from '@/lib/types/ai'
import { cn } from '@/lib/utils'

import ProcessHeader from './process-header'

// The Remotion Player is heavy and browser-only — load it lazily, client-side.
const RemotionPreview = dynamic(
  () => import('./remotion-preview').then(m => m.RemotionPreview),
  { ssr: false }
)

interface RenderSectionProps {
  tool: ToolPart<'composeRender'>
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  borderless?: boolean
  isFirst?: boolean
  isLast?: boolean
}

const fmt = (s: number) => {
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return m ? `${m}m ${sec}s` : `${sec}s`
}

// Renders the composeRender tool: an inline Remotion preview of the storyboard plus a link
// to open the full Studio canvas (/studio/[id]), where the user renders on Remotion Lambda.
export function RenderSection({
  tool,
  isOpen,
  onOpenChange,
  borderless = false,
  isFirst = false,
  isLast = false
}: RenderSectionProps) {
  const isRunning =
    tool.state === 'input-streaming' || tool.state === 'input-available'
  const output = tool.state === 'output-available' ? tool.output : undefined
  const failed = tool.state === 'output-error'
  const error = failed
    ? toPublicErrorPayload(tool.errorText, {
        fallbackMessage: 'Compose failed'
      }).error
    : undefined

  const header = (
    <ProcessHeader
      onInspect={() => onOpenChange(!isOpen)}
      isLoading={isRunning}
      label={
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <Movie className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="block min-w-0 max-w-full truncate">
            {output ? 'Storyboard ready' : 'Composing storyboard'}
          </span>
        </div>
      }
      meta={
        output ? (
          <>
            <Check size={16} className="text-green-500" />
            <span>
              {fmt(output.totalSeconds)} · {output.shots} shots
            </span>
          </>
        ) : failed ? (
          <>
            <AlertCircle size={16} className="text-destructive" />
            <span>{error}</span>
          </>
        ) : (
          <span className="animate-pulse">Assembling…</span>
        )
      }
    />
  )

  const [showPlayer, setShowPlayer] = useState(false)

  return (
    <div className="relative">
      {borderless && (
        <>
          {!isFirst && (
            <div className="absolute left-[19.5px] top-0 h-2 w-px bg-border" />
          )}
          {!isLast && (
            <div className="absolute bottom-0 left-[19.5px] h-2 w-px bg-border" />
          )}
        </>
      )}
      <div
        className={cn(
          'rounded-lg',
          !borderless && 'border border-border bg-card'
        )}
      >
        <div
          className="flex cursor-pointer select-none items-center gap-2 p-3"
          onClick={() => output && onOpenChange(!isOpen)}
        >
          <div className="min-w-0 flex-1">{header}</div>
          {output && (
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                isOpen && 'rotate-180'
              )}
            />
          )}
        </div>
        {output && isOpen && (
          <div className="space-y-3 px-4 pb-4 text-sm">
            {/* Inline Remotion preview — loaded on-demand to save memory & prevent browser crash */}
            {output.inputProps && (
              <div>
                {showPlayer ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Interactive Remotion Player
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowPlayer(false)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Close Preview (Free Memory) ✕
                      </button>
                    </div>
                    <RemotionPreview input={output.inputProps} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-muted/40 p-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Movie className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold">
                        Storyboard Ready ({output.shots} shots · {fmt(output.totalSeconds)})
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Interactive player is paused to keep your browser fast.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowPlayer(true)}
                        className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80"
                      >
                        ▶ Play Interactive Preview
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
              <span className="flex items-center gap-1">
                <Mic className="h-3.5 w-3.5" />
                {output.hadVoice ? 'Voiceover' : 'No voiceover'}
              </span>
              <span className="flex items-center gap-1">
                <Music className="h-3.5 w-3.5" />
                {output.hadMusic ? 'Music bed' : 'No music'}
              </span>
              {output.fallbacks > 0 && (
                <span>
                  {output.fallbacks} brand card
                  {output.fallbacks === 1 ? '' : 's'}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={output.studioPath}
                className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
              >
                Open in Studio →
              </Link>
              {!output.lambdaReady && (
                <span className="text-xs text-muted-foreground">
                  Set REMOTION_SERVE_URL + AWS creds to enable Lambda rendering
                  (see docs/REMOTION_LAMBDA.md).
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default RenderSection
