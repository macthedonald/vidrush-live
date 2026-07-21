import { redirect } from 'next/navigation'

export default async function SearchQueryRedirectPage(props: {
  searchParams: Promise<{ q: string }>
}) {
  const { q } = await props.searchParams
  if (!q) {
    redirect('/')
  }
  redirect(`/chat?q=${encodeURIComponent(q)}`)
}

