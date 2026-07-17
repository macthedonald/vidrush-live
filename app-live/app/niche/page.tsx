import { NicheFinder } from '@/components/niche-finder'

// /niche — the one standalone tool. Everything else in Kakkao is a chat sub-agent.
export const metadata = {
  title: 'Niche Finder — Kakkao'
}

export default function NichePage() {
  return <NicheFinder />
}
