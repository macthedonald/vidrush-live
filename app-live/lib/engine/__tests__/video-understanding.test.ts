import { describe, expect, it } from 'vitest'

import { canonicalYouTubeUrl } from '../video-understanding'

// Gemini only accepts YouTube links in the canonical `watch?v=` / `youtu.be/` shape.
// Anything else makes @ai-sdk/google try to download the page instead of passing the URL
// through, which is what stalled and then crashed the learn-from-video tool.
describe('canonicalYouTubeUrl', () => {
  const ID = 'dQw4w9WgXcQ'
  const CANON = `https://www.youtube.com/watch?v=${ID}`

  it('passes through an already-canonical watch URL', () => {
    expect(canonicalYouTubeUrl(CANON)).toBe(CANON)
  })

  it('normalizes the share/short-link, shorts, embed and live shapes', () => {
    expect(canonicalYouTubeUrl(`https://youtu.be/${ID}`)).toBe(CANON)
    expect(canonicalYouTubeUrl(`https://www.youtube.com/shorts/${ID}`)).toBe(CANON)
    expect(canonicalYouTubeUrl(`https://www.youtube.com/embed/${ID}`)).toBe(CANON)
    expect(canonicalYouTubeUrl(`https://www.youtube.com/live/${ID}`)).toBe(CANON)
  })

  it('normalizes mobile, music and no-cookie hosts', () => {
    expect(canonicalYouTubeUrl(`https://m.youtube.com/watch?v=${ID}`)).toBe(CANON)
    expect(canonicalYouTubeUrl(`https://music.youtube.com/watch?v=${ID}`)).toBe(CANON)
    expect(canonicalYouTubeUrl(`https://www.youtube-nocookie.com/embed/${ID}`)).toBe(
      CANON
    )
  })

  it('drops trailing query junk like timestamps and playlists', () => {
    expect(canonicalYouTubeUrl(`https://youtu.be/${ID}?t=42`)).toBe(CANON)
    expect(
      canonicalYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&list=PLabc&index=2`)
    ).toBe(CANON)
  })

  it('tolerates surrounding whitespace', () => {
    expect(canonicalYouTubeUrl(`  ${CANON}  `)).toBe(CANON)
  })

  it('returns null for non-YouTube and malformed input, rather than throwing', () => {
    expect(canonicalYouTubeUrl('https://vimeo.com/12345')).toBeNull()
    expect(canonicalYouTubeUrl('https://www.youtube.com/watch?v=tooshort')).toBeNull()
    expect(canonicalYouTubeUrl('https://www.youtube.com/feed/subscriptions')).toBeNull()
    expect(canonicalYouTubeUrl('not a url at all')).toBeNull()
    expect(canonicalYouTubeUrl('')).toBeNull()
  })
})
