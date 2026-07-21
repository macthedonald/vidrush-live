// Storyboard composition — the React port of lib/engine/render.ts (the former ffmpeg
// pipeline). Same behavior, now WYSIWYG in the browser (Player preview) and on Lambda:
//   • Ken Burns push/pull on stills (alternating zoom-in / zoom-out per shot)
//   • real clips scaled to cover
//   • drift-free crossfades — each shot owns [start, start+duration+FADE) and fades in
//     over FADE while the previous shot's tail plays underneath, so the merged timeline
//     is exactly Σ durations and stays locked to the voiceover
//   • word-timed karaoke captions
//   • a ducked voiceover + music mix (music loops and fades out at the end)
//   • missing/absent assets fall back to a clean solid-accent brand card (no text)
import React from 'react'

import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig
} from 'remotion'

import { Captions } from './Captions'
import {
  FADE_SECONDS,
  type Shot,
  type StoryboardInput,
  totalSeconds
} from './schema'

// A single shot layer: Ken Burns still, cover-fit clip, or a clean accent card.
const ShotLayer: React.FC<{
  shot: Shot
  index: number
  fadeInFrames: number
  accent: string
}> = ({ shot, index, fadeInFrames, accent }) => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()

  // Crossfade: fade in over the first `fadeInFrames` (0 for the first shot, whose layer
  // sits at the bottom of the stack).
  const opacity =
    fadeInFrames > 0
      ? interpolate(frame, [0, fadeInFrames], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp'
        })
      : 1

  let inner: React.ReactNode
  if (!shot.src) {
    // Clean fallback card — a solid accent frame, no text (the "no card clutter" rule).
    inner = <AbsoluteFill style={{ backgroundColor: accent }} />
  } else if (
    shot.kind === 'video' ||
    shot.kind === 'avatar' ||
    shot.kind === 'a-roll' ||
    shot.src.endsWith('.mp4') ||
    shot.src.startsWith('data:video/')
  ) {
    inner = (
      <OffthreadVideo
        src={shot.src}
        muted
        // Cover-fit the frame like ffmpeg's scale=increase,crop.
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    )
  } else {
    // Ken Burns: alternate a slow push-in and pull-out, 1.00 ↔ 1.09, matching the engine.
    const zoomIn = index % 2 === 0
    const scale = interpolate(
      frame,
      [0, durationInFrames],
      zoomIn ? [1, 1.09] : [1.09, 1],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    )
    inner = (
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <Img
          src={shot.src}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${scale})`,
            transformOrigin: 'center center'
          }}
        />
      </AbsoluteFill>
    )
  }

  return <AbsoluteFill style={{ opacity }}>{inner}</AbsoluteFill>
}

export const Storyboard: React.FC<StoryboardInput> = props => {
  const { fps, height } = useVideoConfig()
  const shots = props.shots
  const accent = props.brand?.accent || '#ff2d55'
  const total = totalSeconds(props)

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {/* Shot stack — later shots paint over earlier ones so the fade-in reads as a
          crossfade against the outgoing shot's tail. */}
      {shots.map((shot, i) => {
        const isLast = i === shots.length - 1
        const from = Math.round(shot.start * fps)
        // Own the shot plus a FADE tail (except the last) so the next shot has something
        // to cross-dissolve against.
        const dur = Math.round(
          (shot.duration + (isLast ? 0 : FADE_SECONDS)) * fps
        )
        const fadeInFrames = i === 0 ? 0 : Math.round(FADE_SECONDS * fps)
        return (
          <Sequence
            key={i}
            from={from}
            durationInFrames={Math.max(1, dur)}
            layout="none"
          >
            <ShotLayer
              shot={shot}
              index={i}
              fadeInFrames={fadeInFrames}
              accent={accent}
            />
          </Sequence>
        )
      })}

      {/* Continuous caption layer on top of every shot. */}
      <Captions shots={shots} accent={accent} />

      {/* Audio: voiceover full-length; music looped, ducked under the VO, faded out. */}
      {props.voice ? <Audio src={props.voice} /> : null}
      {props.music ? (
        <MusicBed src={props.music} total={total} ducked={!!props.voice} />
      ) : null}
    </AbsoluteFill>
  )
}

// Music bed — loops to cover the timeline, ducked when a voiceover is present, with a
// 2s fade-out at the end (mirrors the engine's volume + afade).
const MusicBed: React.FC<{ src: string; total: number; ducked: boolean }> = ({
  src,
  total,
  ducked
}) => {
  const { fps } = useVideoConfig()
  const base = ducked ? 0.12 : 0.5
  const fadeStart = Math.max(0, total - 2)
  return (
    <Audio
      src={src}
      loop
      volume={frame => {
        const t = frame / fps
        if (t < fadeStart) return base
        return interpolate(t, [fadeStart, total], [base, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp'
        })
      }}
    />
  )
}

export default Storyboard
