'use client'

import {
  IconAlertCircle as AlertCircle,
  IconCheck as Check,
  IconChevronDown as ChevronDown,
  IconMovie as Movie,
  IconMusic as Music,
  IconMicrophone as Mic
} from '@tabler/icons-react'
import dynamic from 'next/dynamic'

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

// Renders the composeRender tool: an interactive Remotion preview of the storyboard (the
// same composition Lambda renders), plus the finished MP4 once Lambda returns its URL, and
// a summary (duration, shot count, audio tracks, fallback cards).
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
        fallbackMessage: 'Render failed'
      }).error
    : undefined

  const hasVideo = !!output?.videoUrl
  const header = (
    <ProcessHeader
      onInspect={() => onOpenChange(!isOpen)}
      isLoading={isRunning}
      label={
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <Movie className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="block min-w-0 max-w-full truncate">
            {hasVideo
              ? 'Rendered video'
              : output
                ? 'Storyboard preview'
                : 'Composing storyboard'}
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
        className={cn('rounded-lg', !borderless && 'border border-border bg-card')}
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
          <div className="space-y-2 px-4 pb-4 text-sm">
            {/* Interactive Remotion preview — identical to the Lambda render. */}
            {output.inputProps && <RemotionPreview input={output.inputProps} />}

            {/* Finished MP4 from Lambda, when available. */}
            {output.videoUrl && (
              <video
                controls
                preload="metadata"
                src={output.videoUrl}
                className="w-full rounded-md bg-black"
              />
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
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

            {output.videoUrl ? (
              <a
                href={output.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block break-all text-xs text-primary underline"
              >
                {output.videoUrl}
              </a>
            ) : 'needsLambda' in output && output.needsLambda ? (
              <p className="break-all rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                Preview only — configure Remotion Lambda (REMOTION_SERVE_URL +
                AWS credentials) to render the final MP4. See
                docs/REMOTION_LAMBDA.md.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

export default RenderSection
