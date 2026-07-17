'use client'

import {
  IconAlertCircle as AlertCircle,
  IconCheck as Check,
  IconChevronDown as ChevronDown,
  IconPhoto as Photo
} from '@tabler/icons-react'

import { toPublicErrorPayload } from '@/lib/errors/public-error'
import type { ToolPart } from '@/lib/types/ai'
import { cn } from '@/lib/utils'

import ProcessHeader from './process-header'

interface ImageSectionProps {
  tool: ToolPart<'generateImage'> | ToolPart<'generateThumbnail'>
  variant: 'image' | 'thumbnail'
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  borderless?: boolean
  isFirst?: boolean
  isLast?: boolean
}

// Renders the generateImage / generateThumbnail tools: a preview of the AI33-generated
// still, with the model name and a link to the hosted image.
export function ImageSection({
  tool,
  variant,
  isOpen,
  onOpenChange,
  borderless = false,
  isFirst = false,
  isLast = false
}: ImageSectionProps) {
  const isRunning =
    tool.state === 'input-streaming' || tool.state === 'input-available'
  const output = tool.state === 'output-available' ? tool.output : undefined
  const failed = tool.state === 'output-error'
  const error = failed
    ? toPublicErrorPayload(tool.errorText, {
        fallbackMessage:
          variant === 'thumbnail'
            ? 'Thumbnail generation failed'
            : 'Image generation failed'
      }).error
    : undefined

  const noun = variant === 'thumbnail' ? 'thumbnail' : 'image'
  const running = variant === 'thumbnail' ? 'Generating thumbnail' : 'Generating image'
  const done = variant === 'thumbnail' ? 'Thumbnail' : 'Image'

  const header = (
    <ProcessHeader
      onInspect={() => onOpenChange(!isOpen)}
      isLoading={isRunning}
      label={
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <Photo className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="block min-w-0 max-w-full truncate">
            {output ? done : running}
          </span>
        </div>
      }
      meta={
        output ? (
          <>
            <Check size={16} className="text-green-500" />
            <span>{output.model || `${noun} ready`}</span>
          </>
        ) : failed ? (
          <>
            <AlertCircle size={16} className="text-destructive" />
            <span>{error}</span>
          </>
        ) : (
          <span className="animate-pulse">Rendering…</span>
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
      <div className={cn('rounded-lg', !borderless && 'border border-border bg-card')}>
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
        {output && isOpen && output.imageUrl && (
          <div className="space-y-2 px-4 pb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={output.imageUrl}
              alt={`Generated ${noun}`}
              className="w-full rounded-md bg-black"
            />
            <a
              href={output.imageUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block break-all text-xs text-primary underline"
            >
              {output.imageUrl}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

export default ImageSection
