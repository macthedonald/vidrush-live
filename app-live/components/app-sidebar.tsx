import { Suspense } from 'react'
import Link from 'next/link'

import type { User } from '@supabase/supabase-js'

import { cn } from '@/lib/utils'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarRail,
  SidebarTrigger
} from '@/components/ui/sidebar'

import GuestMenu from './guest-menu'
import { ChatHistorySection } from './sidebar/chat-history-section'
import { ChatHistorySkeleton } from './sidebar/chat-history-skeleton'
import { NavMenuItems } from './sidebar/nav-menu-items'
import { NewChatMenuItem } from './sidebar/new-chat-menu-item'
import { IconLogo } from './ui/icons'
import UserMenu from './user-menu'

export default function AppSidebar({ user }: { user?: User | null }) {
  return (
    <Sidebar side="left" variant="sidebar" collapsible="offcanvas">
      <SidebarHeader className="flex flex-row justify-between items-center">
        <Link href="/" className="flex items-center gap-2 px-2 py-3">
          <IconLogo className={cn('size-5')} />
          <span className="font-semibold text-sm">Kakkao</span>
        </Link>
        <SidebarTrigger />
      </SidebarHeader>
      <SidebarContent className="flex flex-col px-2 py-4 h-full">
        <SidebarMenu>
          <NewChatMenuItem />
          <NavMenuItems />
        </SidebarMenu>
        <div className="flex-1 overflow-y-auto">
          <Suspense fallback={<ChatHistorySkeleton />}>
            <ChatHistorySection />
          </Suspense>
        </div>
      </SidebarContent>
      <SidebarFooter className="p-3 border-t border-sidebar-border/60 flex items-center justify-between">
        {user ? <UserMenu user={user} /> : <GuestMenu />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
