'use client'

import {
  IconAlertCircle as AlertCircle,
  IconCheck as Check,
  IconChevronDown as ChevronDown,
  IconUserCheck as UserCheck,
  IconVideo as Video
} from '@tabler/icons-react'

import { toPublicErrorPayload } from '@/lib/errors/public-error'
import type { ToolPart } from '@/lib/types/ai'
import { cn } from '@/lib/utils'

import ProcessHeader from './process-header'

interface AvatarSectionProps {
  tool: ToolPart<'generateAvatar'>
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  borderless?: boolean
  isFirst?: boolean
  isLast?: boolean
}

export function AvatarSection({
  tool,
  isOpen,
  onOpenChange,
  borderless = false,
  isFirst = false,
  isLast = false
}: AvatarSectionProps) {
  const isRunning =
    tool.state === 'input-streaming' || tool.state === 'input-available'
  const output = tool.state === 'output-available' ? tool.output : undefined
  const failed = tool.state === 'output-error'
  const error = failed
    ? toPublicErrorPayload(tool.errorText, {
        fallbackMessage: 'Avatar generation failed'
      }).error
    : undefined

  const header = (
    <ProcessHeader
      onInspect={() => onOpenChange(!isOpen)}
      isLoading={isRunning}
      label={
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <UserCheck className="h-4 w-4 shrink-0 text-primary" />
          <span className="block min-w-0 max-w-full truncate font-medium">
            {output ? 'Talking Avatar (A-Roll)' : 'Synthesizing MuseTalk Avatar'}
          </span>
        </div>
      }
      meta={
        output ? (
          <>
            <Check size={16} className="text-green-500" />
            <span className="text-xs text-muted-foreground">
              {output.isModalHosted ? 'MuseTalk (Modal GPU)' : output.model}
            </span>
          </>
        ) : failed ? (
          <>
            <AlertCircle size={16} className="text-destructive" />
            <span className="text-xs text-destructive">{error}</span>
          </>
        ) : (
          <span className="animate-pulse text-xs text-muted-foreground">
            Synthesizing lip-sync on Modal…
          </span>
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
        className={cn(
          'rounded-lg transition-colors',
          !borderless && 'border border-border/80 bg-card/60'
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
          <div className="space-y-3 px-4 pb-4">
            <div className="flex items-center gap-2 rounded-md border border-border/50 bg-background/50 p-2 text-xs text-muted-foreground">
              <Video className="h-3.5 w-3.5 text-primary" />
              <span>
                Engine: <strong className="text-foreground">{output.model}</strong>
              </span>
              <span className="ml-auto rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {output.isModalHosted ? 'Modal GPU' : 'A-Roll Presenter'}
              </span>
            </div>

            {output.videoUrl && (
              <div className="overflow-hidden rounded-lg border border-border/60 bg-black">
                {output.videoUrl.startsWith('data:video') || output.videoUrl.endsWith('.mp4') ? (
                  <video
                    src={output.videoUrl}
                    controls
                    playsInline
                    className="aspect-video w-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={output.videoUrl}
                    alt="Presenter avatar"
                    className="aspect-video w-full object-cover"
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default AvatarSection
