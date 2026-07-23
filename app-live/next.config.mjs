// This app lives in the app-live/ subdirectory of a multi-package repo (worker/, spike/,
// hook/ are siblings). On Vercel the project's Root Directory is app-live, so the build
// already runs here; letting Vercel's @vercel/next builder infer the tracing root itself
// (rather than pinning outputFileTracingRoot/turbopack.root) keeps the build and the
// post-build packaging step in agreement — pinning them made @vercel/next look for
// .next/package.json at the wrong base and fail with ENOENT.

// ── Sanitize env vars before Next.js inlines them ────────────────────────────
// Vercel env vars sometimes acquire invisible BOM (\uFEFF), zero-width spaces (\u200B),
// or trailing \r\n from copy-paste in the dashboard. Next.js inlines NEXT_PUBLIC_*
// values at build time, so they must be clean BEFORE config is evaluated.
// We also sanitize server-side URL/key vars used at runtime.
const SANITIZE_PREFIXES = ['NEXT_PUBLIC_']
const SANITIZE_KEYS = [
  'SUPABASE_SECRET_KEY', 'DATABASE_URL',
  'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
  'ANTHROPIC_API_KEY'
]
for (const key of Object.keys(process.env)) {
  const shouldSanitize =
    SANITIZE_PREFIXES.some(p => key.startsWith(p)) ||
    SANITIZE_KEYS.includes(key)
  if (shouldSanitize && typeof process.env[key] === 'string') {
    process.env[key] = process.env[key]
      .replace(/^[\uFEFF\u200B\s]+|[\uFEFF\u200B\s]+$/g, '')
      .trim()
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Reverse proxy for PostHog to reduce tracking-blocker interception.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: '/relay/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*'
      },
      {
        source: '/relay/array/:path*',
        destination: 'https://us-assets.i.posthog.com/array/:path*'
      },
      {
        source: '/relay/:path*',
        destination: 'https://us.i.posthog.com/:path*'
      }
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        port: '',
        pathname: '/vi/**'
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/a/**' // Google user content often follows this pattern
      },
      {
        protocol: 'https',
        hostname: 'imgs.search.brave.com',
        port: '',
        pathname: '/**' // Brave search cached images
      },
      {
        protocol: 'https',
        hostname: 'www.google.com',
        port: '',
        pathname: '/s2/favicons/**' // Google Favicon API
      }
    ]
  }
}

export default nextConfig
