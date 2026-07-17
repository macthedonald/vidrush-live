// Karaoke word-timed captions — the React port of the ffmpeg engine's ASS `\k` subtitles.
// Renders the line for whichever shot is active at the current frame, highlighting each
// word as it is spoken: unspoken words carry the brand accent, spoken words go white
// (mirroring the ASS PrimaryColour=white / SecondaryColour=accent karaoke sweep).
import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'

import type { Shot } from './schema'

export const Captions: React.FC<{ shots: Shot[]; accent: string }> = ({
  shots,
  accent
}) => {
  const frame = useCurrentFrame()
  const { fps, height } = useVideoConfig()
  const t = frame / fps

  // The active shot is the one whose [start, start+duration) window contains t.
  const shot =
    shots.find(s => t >= s.start && t < s.start + s.duration) ??
    shots.find(s => s.words?.length && t < s.start + s.duration)
  const words = shot?.words
  if (!words?.length) return null

  const fontSize = Math.round(height * 0.045)

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: Math.round(height * 0.06),
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '0 0.28em',
        padding: '0 6%',
        fontFamily:
          '"DejaVu Sans", system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        fontSize,
        fontWeight: 800,
        lineHeight: 1.2,
        textAlign: 'center'
      }}
    >
      {words.map((w, i) => {
        const spoken = t >= w.start
        return (
          <span
            key={i}
            style={{
              color: spoken ? '#ffffff' : accent,
              // Text outline + drop shadow, echoing the ASS Outline/Shadow settings.
              textShadow:
                '0 0 2px #101010, 2px 2px 4px rgba(0,0,0,0.55), -1px -1px 2px #101010',
              transition: 'none'
            }}
          >
            {w.word}
          </span>
        )
      })}
    </div>
  )
}

export default Captions
