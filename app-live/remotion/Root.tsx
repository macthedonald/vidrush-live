// Remotion root — registers the compositions the CLI, Studio and Lambda can render.
// The composition's dimensions, fps and length are derived from the storyboard input
// via calculateMetadata, so a single registered id renders any storyboard.
import React from 'react'

import { Composition } from 'remotion'

import {
  durationInFrames as calcDurationInFrames,
  type StoryboardInput
} from './schema'
import { Storyboard } from './Storyboard'

// A minimal placeholder so the Studio renders something before real props arrive.
const defaultProps: StoryboardInput = {
  width: 1280,
  height: 720,
  fps: 30,
  brand: { accent: '#ff2d55' },
  shots: [
    {
      kind: 'photo',
      start: 0,
      duration: 3,
      words: [
        { word: 'Kakkao', start: 0.1, end: 0.7 },
        { word: 'storyboard', start: 0.7, end: 1.4 },
        { word: 'preview', start: 1.4, end: 2.0 }
      ]
    }
  ]
}

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Storyboard"
      component={Storyboard}
      defaultProps={defaultProps}
      // Width/height/fps/length all come from the input props at render time.
      width={defaultProps.width}
      height={defaultProps.height}
      fps={defaultProps.fps}
      durationInFrames={calcDurationInFrames(defaultProps)}
      calculateMetadata={({ props }) => ({
        width: props.width,
        height: props.height,
        fps: props.fps,
        durationInFrames: calcDurationInFrames(props)
      })}
    />
  )
}

export default RemotionRoot
