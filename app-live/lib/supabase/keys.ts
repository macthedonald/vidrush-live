export function cleanEnvString(raw: string | undefined | null): string {
  if (!raw) return ''
  return raw.replace(/^[\uFEFF\u200B\s]+|[\uFEFF\u200B\s]+$/g, '').trim()
}

export function getSupabaseUrl() {
  return cleanEnvString(process.env.NEXT_PUBLIC_SUPABASE_URL)
}

export function getSupabasePublishableKey() {
  return cleanEnvString(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
}

export function hasSupabasePublicConfig() {
  return Boolean(getSupabaseUrl() && getSupabasePublishableKey())
}
