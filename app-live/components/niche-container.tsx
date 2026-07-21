'use client'

import { useState } from 'react'
import { IconCompass, IconTarget } from '@tabler/icons-react'

import { cn } from '@/lib/utils'
import { NicheFinder } from './niche-finder'
import { NicheBendingTool } from './niche-bending-tool'

export function NicheContainer() {
  const [activeTab, setActiveTab] = useState<'finder' | 'bending'>('finder')

  return (
    <div className="w-full space-y-6">
      {/* Top Tab Bar */}
      <div className="mx-auto max-w-5xl px-4 md:px-8 pt-4">
        <div className="inline-flex items-center gap-1 rounded-2xl border border-border bg-card/60 p-1.5 backdrop-blur-md">
          <button
            onClick={() => setActiveTab('finder')}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs md:text-sm font-bold transition-all',
              activeTab === 'finder'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
          >
            <IconTarget className="h-4 w-4" /> Niche Finder
          </button>
          <button
            onClick={() => setActiveTab('bending')}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs md:text-sm font-bold transition-all',
              activeTab === 'bending'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
          >
            <IconCompass className="h-4 w-4" /> Niche Bending Engine
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'finder' ? <NicheFinder /> : <NicheBendingTool />}
    </div>
  )
}
