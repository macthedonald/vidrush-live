// Same-origin proxy for provider APIs. The browser hits /api/proxy on our own domain
// (no CORS); we relay server-side. Crucially, ALL API keys live in the server environment
// (.env / Vercel env vars) and are INJECTED here per destination host — the browser never
// holds or sees a key. The caller passes the destination in the x-proxy-url header; any
// key it sends is ignored and overridden with the server's env key.
export const config = { runtime: 'edge' }

const ALLOW = [
  /(^|\.)ai33\.pro$/,
  /(^|\.)anthropic\.com$/,
  /(^|\.)googleapis\.com$/,
  /(^|\.)groq\.com$/,
  /\.r2\.dev$/,
  /\.r2\.cloudflarestorage\.com$/,
  /(^|\.)suno\.ai$/,
  /(^|\.)pexels\.com$/,
  /(^|\.)pixabay\.com$/,
  /(^|\.)coverr\.co$/,
  /(^|\.)vimeocdn\.com$/,
  /(^|\.)wikimedia\.org$/,
  /(^|\.)wikipedia\.org$/,
  /(^|\.)archive\.org$/,
  /(^|\.)archives\.gov$/,
  /(^|\.)s3\.amazonaws\.com$/
]

const env = k => (typeof process !== 'undefined' && process.env && process.env[k]) || ''

// Inject the server-side key for a host onto the outgoing request (URL + headers).
// Returns the possibly-rewritten target URL string. Key-in-query providers get the key
// set on the URL; header-auth providers get the header set. Media hosts get nothing.
function injectKey(url, headers) {
  const host = url.hostname
  const setQ = (param, val) => {
    if (val) url.searchParams.set(param, val)
  }
  if (/(^|\.)ai33\.pro$/.test(host)) {
    if (env('AI33_API_KEY')) headers['xi-api-key'] = env('AI33_API_KEY')
  } else if (/(^|\.)anthropic\.com$/.test(host)) {
    if (env('ANTHROPIC_API_KEY')) headers['x-api-key'] = env('ANTHROPIC_API_KEY')
    if (!headers['anthropic-version']) headers['anthropic-version'] = '2023-06-01'
  } else if (/(^|\.)groq\.com$/.test(host)) {
    if (env('GROQ_API_KEY')) headers['authorization'] = `Bearer ${env('GROQ_API_KEY')}`
  } else if (/(^|\.)pexels\.com$/.test(host)) {
    if (env('PEXELS_API_KEY')) headers['authorization'] = env('PEXELS_API_KEY')
  } else if (/(^|\.)coverr\.co$/.test(host)) {
    if (env('COVERR_API_KEY')) headers['authorization'] = `Bearer ${env('COVERR_API_KEY')}`
  } else if (/(^|\.)pixabay\.com$/.test(host)) {
    setQ('key', env('PIXABAY_API_KEY'))
  } else if (/(^|\.)archives\.gov$/.test(host)) {
    if (env('NARA_API_KEY')) headers['x-api-key'] = env('NARA_API_KEY')
  } else if (/(^|\.)generativelanguage\.googleapis\.com$/.test(host)) {
    setQ('key', env('GEMINI_API_KEY'))
  } else if (/(^|\.)googleapis\.com$/.test(host)) {
    // YouTube Data API uses an API key; OAuth uploads carry a Bearer token — never
    // override those (leave the caller's Authorization header intact).
    if (!headers['authorization']) setQ('key', env('YOUTUBE_API_KEY'))
  }
  return url.href
}

export default async function handler(request) {
  const target = request.headers.get('x-proxy-url')
  if (!target) return new Response('missing x-proxy-url', { status: 400 })
  let url
  try {
    url = new URL(target)
  } catch {
    return new Response('bad url', { status: 400 })
  }
  if (url.protocol !== 'https:' || !ALLOW.some(re => re.test(url.hostname))) {
    return new Response('host not allowed', { status: 403 })
  }
  // Forward a minimal header set from the caller (content-type/accept + any OAuth Bearer).
  const headers = {}
  for (const h of ['authorization', 'content-type', 'accept', 'anthropic-version']) {
    const v = request.headers.get(h)
    if (v) headers[h] = v
  }
  // Anthropic's browser-access shim is required even server-side for this endpoint shape.
  if (/(^|\.)anthropic\.com$/.test(url.hostname)) {
    headers['anthropic-dangerous-direct-browser-access'] = 'true'
  }
  // Inject the server-side key for this host (overriding anything the client sent).
  const finalTarget = injectKey(url, headers)
  // Browsers can't set User-Agent from fetch; some APIs (e.g. Wikimedia) 403 without one.
  headers['user-agent'] = 'Kakkao/1.0 (+https://kakkao.vercel.app)'
  const method = request.method
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer()
  let upstream
  try {
    upstream = await fetch(finalTarget, { method, headers, body })
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'upstream fetch failed: ' + e.message }),
      { status: 502, headers: { 'content-type': 'application/json' } }
    )
  }
  const respHeaders = new Headers()
  const ct = upstream.headers.get('content-type')
  if (ct) respHeaders.set('content-type', ct)
  respHeaders.set('access-control-allow-origin', '*')
  return new Response(upstream.body, { status: upstream.status, headers: respHeaders })
}
