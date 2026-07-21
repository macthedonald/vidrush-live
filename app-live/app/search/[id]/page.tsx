import { redirect } from 'next/navigation'

export default async function SearchRedirectPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  redirect(`/chat/${id}`)
}

