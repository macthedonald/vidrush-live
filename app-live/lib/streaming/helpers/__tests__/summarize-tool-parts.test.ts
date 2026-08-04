import { describe, expect, it } from 'vitest'

import { sanitizeMessagesForModel } from '../sanitize-messages-for-model'
import { summarizeToolParts } from '../summarize-tool-parts'

describe('summarizeToolParts', () => {
  it('carries ids and artifacts forward so the pipeline can resume', () => {
    const digest = summarizeToolParts([
      {
        type: 'tool-generateVoiceover',
        state: 'output-available',
        output: { voiceoverId: 'vo_abc123', audioUrl: 'https://cdn/x.mp3' }
      },
      {
        type: 'tool-cutBeats',
        state: 'output-available',
        output: { shots: [{}, {}, {}], totalSeconds: 42.5, format: '16:9' }
      }
    ])

    expect(digest).toContain('voiceoverId=vo_abc123')
    expect(digest).toContain('shots=3')
    expect(digest).toContain('totalSeconds=42.5')
  })

  it('records the answer the user picked for askQuestion', () => {
    const digest = summarizeToolParts([
      {
        type: 'tool-askQuestion',
        state: 'output-available',
        input: { question: 'Which video style?' },
        output: { selectedOption: 'Cinematic B-roll' }
      }
    ])

    expect(digest).toContain('Which video style?')
    expect(digest).toContain('Cinematic B-roll')
  })

  it('skips calls that never produced a result', () => {
    expect(
      summarizeToolParts([
        { type: 'tool-writeScript', state: 'input-available', input: { topic: 'x' } }
      ])
    ).toBe('')
  })

  it('reports failed tools instead of silently dropping them', () => {
    const digest = summarizeToolParts([
      {
        type: 'tool-generateThumbnail',
        state: 'output-error',
        errorText: 'AI33_API_KEY is not set'
      }
    ])
    expect(digest).toContain('generateThumbnail: FAILED')
  })

  it('ignores non-tool parts', () => {
    expect(summarizeToolParts([{ type: 'text', text: 'hi' }])).toBe('')
  })
})

describe('sanitizeMessagesForModel tool memory', () => {
  it('replaces tool parts with a text digest rather than deleting them', () => {
    const [assistant] = sanitizeMessagesForModel([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Here is your script.' },
          {
            type: 'tool-writeScript',
            state: 'output-available',
            toolCallId: 'tc1',
            output: { scriptId: 'sc_1', script: 'Once upon a time.' }
          }
        ]
      } as any
    ])

    const types = assistant.parts.map((p: any) => p.type)
    expect(types).toEqual(['text', 'text'])

    const digest = (assistant.parts[1] as any).text
    expect(digest).toContain('scriptId=sc_1')
    expect(digest).toContain('Prior pipeline state')
  })

  it('still emits no tool blocks, so nothing can be left unpaired', () => {
    const [assistant] = sanitizeMessagesForModel([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-cutBeats',
            state: 'output-available',
            toolCallId: 'tc1',
            output: { shots: [{}] }
          }
        ]
      } as any
    ])

    expect(
      assistant.parts.some((p: any) => String(p.type).startsWith('tool-'))
    ).toBe(false)
  })
})
