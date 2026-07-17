// Reports which provider keys are configured server-side (.env / Vercel env vars), as
// booleans only — never the values. The client uses this to gate the UI (show a provider
// as ready/unavailable) now that keys live in the environment instead of the browser.
export const config = { runtime: 'edge' }

const has = k =>
  Boolean(typeof process !== 'undefined' && process.env && process.env[k])

export default async function handler() {
  const body = {
    anthropic: has('ANTHROPIC_API_KEY'),
    youtube: has('YOUTUBE_API_KEY'),
    gemini: has('GEMINI_API_KEY'),
    groq: has('GROQ_API_KEY'),
    ai33: has('AI33_API_KEY'),
    pexels: has('PEXELS_API_KEY'),
    pixabay: has('PIXABAY_API_KEY'),
    coverr: has('COVERR_API_KEY'),
    nara: has('NARA_API_KEY'),
    // Image + thumbnail generation both run on AI33 now (gpt-image-2 / nano-banana-pro).
    images: has('AI33_API_KEY'),
    ai33Base: process.env.AI33_BASE_URL || 'https://api.ai33.pro',
    googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || ''
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*'
    }
  })
}
