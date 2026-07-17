'use client'

import {
  IconAlertCircle as AlertCircle,
  IconCheck as Check,
  IconChevronDown as ChevronDown,
  IconVideo as Video
} from '@tabler/icons-react'

import { toPublicErrorPayload } from '@/lib/errors/public-error'
import type { ToolPart } from '@/lib/types/ai'
import { cn } from '@/lib/utils'

import ProcessHeader from './process-header'

interface LearnVideoSectionProps {
  tool: ToolPart<'learnFromVideo'>
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  borderless?: boolean
  isFirst?: boolean
  isLast?: boolean
}

// Renders the learnFromVideo tool: the reverse-engineered style template of a reference
// YouTube video (hook, phases, pacing, narration devices).
export function LearnVideoSection({
  tool,
  isOpen,
  onOpenChange,
  borderless = false,
  isFirst = false,
  isLast = false
}: LearnVideoSectionProps) {
  const isRunning =
    tool.state === 'input-streaming' || tool.state === 'input-available'
  const output = tool.state === 'output-available' ? tool.output : undefined
  const failed = tool.state === 'output-error'
  const error = failed
    ? toPublicErrorPayload(tool.errorText, {
        fallbackMessage: 'Could not analyze the video'
      }).error
    : undefined

  const header = (
    <ProcessHeader
      onInspect={() => onOpenChange(!isOpen)}
      isLoading={isRunning}
      label={
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="block min-w-0 max-w-full truncate">
            {output ? 'Learned from video' : 'Watching reference video'}
          </span>
        </div>
      }
      meta={
        output ? (
          <>
            <Check size={16} className="text-green-500" />
            <span>via {output.provider === 'claude' ? 'Claude' : 'Gemini'}</span>
          </>
        ) : failed ? (
          <>
            <AlertCircle size={16} className="text-destructive" />
            <span>{error}</span>
          </>
        ) : (
          <span className="animate-pulse">Analyzing structure…</span>
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
            {output.summary && <p className="text-foreground">{output.summary}</p>}
            {output.hook && (
              <p className="text-muted-foreground">
                <b className="text-foreground">Hook:</b> {output.hook}
              </p>
            )}
            {output.pacing && (
              <p className="text-muted-foreground">
                <b className="text-foreground">Pacing:</b> {output.pacing}
              </p>
            )}
            {output.visualMix && (
              <p className="text-muted-foreground">
                <b className="text-foreground">Visual mix:</b> {output.visualMix}
              </p>
            )}
            {output.phases && output.phases.length > 0 && (
              <div>
                <b className="text-foreground">Phases</b>
                <ol className="ml-4 list-decimal text-muted-foreground">
                  {output.phases.map((p, i) => (
                    <li key={i}>
                      <b className="text-foreground">{p.name}</b> — {p.purpose}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {output.narrationDevices && output.narrationDevices.length > 0 && (
              <p className="text-muted-foreground">
                <b className="text-foreground">Devices:</b>{' '}
                {output.narrationDevices.join(', ')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default LearnVideoSection
