// Providers (AI33, Anthropic, Google APIs, Groq, stock-video CDNs, R2 result URLs) don't send
// CORS headers, so the browser can't call them directly. Route those through our own
// same-origin proxy (/api/proxy — a Vercel Edge function in prod, a Vite middleware in dev).
// Same-origin means no browser CORS at all; the proxy relays server-side where CORS doesn't apply.
// API keys are NOT sent from the browser — the proxy injects each provider's key from the
// server environment (.env / Vercel env vars), so no secret ever reaches the client.
const PROXY_HOSTS = [
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
  /(^|\.)s3\.amazonaws\.com$/,
];

export function needsProxy(url) {
  try { return PROXY_HOSTS.some((re) => re.test(new URL(url, location.href).hostname)); }
  catch { return false; }
}

// Drop-in fetch: transparently proxies CORS-blocked hosts, passes everything else through.
export function pfetch(url, opts = {}) {
  try {
    const u = new URL(url, location.href);
    if (PROXY_HOSTS.some((re) => re.test(u.hostname))) {
      return fetch("/api/proxy", { ...opts, headers: { ...(opts.headers || {}), "x-proxy-url": u.href } });
    }
  } catch {}
  return fetch(url, opts);
}
