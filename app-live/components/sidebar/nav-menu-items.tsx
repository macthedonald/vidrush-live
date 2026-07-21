'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  IconCompass as Compass,
  IconTrendingUp as TrendingUp,
  IconUser as User
} from '@tabler/icons-react'

import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'

export function NavMenuItems() {
  const pathname = usePathname()
  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={pathname === '/niche'}>
          <Link href="/niche" className="flex items-center gap-2">
            <TrendingUp className="size-4" />
            <span>Niche Finder</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={pathname === '/niche-bender'}>
          <Link href="/niche-bender" className="flex items-center gap-2">
            <Compass className="size-4" />
            <span>Niche Bender</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={pathname === '/avatars' || pathname === '/niche-bender/avatars'}
        >
          <Link href="/avatars" className="flex items-center gap-2">
            <User className="size-4" />
            <span>Avatars</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </>
  )
}

