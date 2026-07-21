'use client'

// In-chat Remotion preview — an interactive, scrubbable player for a storyboard. It renders
// the exact same <Storyboard> composition that Remotion Lambda renders to MP4, so the
// preview is a faithful WYSIWYG of the final video. Shown as soon as composeRender returns
// its storyboard (before the Lambda MP4 exists) and alongside the finished MP4 after.
import { useEffect, useRef } from 'react'
import { Player, type PlayerRef } from '@remotion/player'

import { durationInFrames, type StoryboardInput } from '@/remotion/schema'
import { Storyboard } from '@/remotion/Storyboard'

export function RemotionPreview({ input }: { input: StoryboardInput }) {
  const frames = durationInFrames(input)
  const playerRef = useRef<PlayerRef>(null)

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.pause()
        } catch {
          // Ignore cleanup errors on unmount
        }
      }
    }
  }, [])

  return (
    <div className="overflow-hidden rounded-md bg-black">
      <Player
        ref={playerRef}
        component={Storyboard}
        inputProps={input}
        durationInFrames={frames}
        fps={input.fps}
        compositionWidth={input.width}
        compositionHeight={input.height}
        style={{ width: '100%' }}
        controls
        acknowledgeRemotionLicense
      />
    </div>
  )
}

export default RemotionPreview
