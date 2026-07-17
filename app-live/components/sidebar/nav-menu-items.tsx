'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { IconTrendingUp as TrendingUp } from '@tabler/icons-react'

import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'

// Standalone-tool nav. Niche Finder is the one standalone page in Kakkao; everything else
// is a chat sub-agent reached from the composer.
export function NavMenuItems() {
  const pathname = usePathname()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={pathname === '/niche'}>
        <Link href="/niche" className="flex items-center gap-2">
          <TrendingUp className="size-4" />
          <span>Niche Finder</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
