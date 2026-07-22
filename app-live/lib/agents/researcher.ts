import { stepCountIs, tool, ToolLoopAgent } from 'ai'

import type { ResearcherTools } from '@/lib/types/agent'
import { type Model } from '@/lib/types/models'

import { fetchTool } from '../tools/fetch'
import { createQuestionTool } from '../tools/question'
import { createSearchTool } from '../tools/search'
import { createTodoTools } from '../tools/todo'
import { createCloneVoiceTool } from '../tools/video/clone-voice'
import { createComposeRenderTool } from '../tools/video/compose-render'
import { createCutBeatsTool } from '../tools/video/cut-beats'
import { createGenerateAvatarTool } from '../tools/video/generate-avatar'
import { createGenerateImageTool } from '../tools/video/generate-image'
import { createGenerateMusicTool } from '../tools/video/generate-music'
import { createGenerateThumbnailTool } from '../tools/video/generate-thumbnail'
import { createGenerateVoiceoverTool } from '../tools/video/generate-voiceover'
import { createLearnFromVideoTool } from '../tools/video/learn-from-video'
import { createListVoicesTool } from '../tools/video/list-voices'
import { createSourceFootageTool } from '../tools/video/source-footage'
import { createWriteScriptTool } from '../tools/video/write-script'
import { SearchMode } from '../types/search'
import { getModel } from '../utils/registry'
import { isTracingEnabled } from '../utils/telemetry'

import {
  getAdaptiveModePrompt,
  getQuickModePrompt
} from './prompts/search-mode-prompts'

// Enhanced wrapper function with better type safety and streaming support
function wrapSearchToolForQuickMode<
  T extends ReturnType<typeof createSearchTool>
>(originalTool: T): T {
  return tool({
    description: originalTool.description,
    inputSchema: originalTool.inputSchema,
    // Preserve the original tool's model-output trimming (strips the duplicated
    // citationMap / UI-only images) so quick mode gets the same payload savings.
    toModelOutput: originalTool.toModelOutput,
    async *execute(params, context) {
      const executeFunc = originalTool.execute
      if (!executeFunc) {
        throw new Error('Search tool execute function is not defined')
      }

      // Force optimized type for quick mode
      const modifiedParams = {
        ...params,
        type: 'optimized' as const
      }

      // Execute the original tool and pass through all yielded values
      const result = executeFunc(modifiedParams, context)

      // Handle AsyncIterable (streaming) case
      if (
        result &&
        typeof result === 'object' &&
        Symbol.asyncIterator in result
      ) {
        for await (const chunk of result) {
          yield chunk
        }
      } else {
        // Fallback for non-streaming (shouldn't happen with new implementation)
        const finalResult = await result
        yield finalResult || {
          state: 'complete' as const,
          results: [],
          images: [],
          query: params.query,
          number_of_results: 0
        }
      }
    }
  }) as T
}

// Enhanced researcher function with improved type safety using ToolLoopAgent
// Note: abortSignal should be passed to agent.stream() or agent.generate() calls, not to the agent constructor
export function createResearcher({
  model,
  modelConfig,
  parentTraceId,
  searchMode = 'adaptive',
  relatedEnabled = true
}: {
  model: string
  modelConfig?: Model
  parentTraceId?: string
  searchMode?: SearchMode
  relatedEnabled?: boolean
}) {
  try {
    const currentDate = new Date().toLocaleString()

    // Create model-specific tools with proper typing
    const originalSearchTool = createSearchTool(model)
    const askQuestionTool = createQuestionTool(model)
    const todoTools = createTodoTools()
    const writeScriptTool = createWriteScriptTool(model)
    const sourceFootageTool = createSourceFootageTool()
    const cutBeatsTool = createCutBeatsTool(model)
    const composeRenderTool = createComposeRenderTool()
    const generateVoiceoverTool = createGenerateVoiceoverTool()
    const listVoicesTool = createListVoicesTool()
    const cloneVoiceTool = createCloneVoiceTool()
    const generateMusicTool = createGenerateMusicTool()
    const generateImageTool = createGenerateImageTool()
    const generateThumbnailTool = createGenerateThumbnailTool()
    const learnFromVideoTool = createLearnFromVideoTool()
    const generateAvatarTool = createGenerateAvatarTool()

    let systemPrompt: string
    let activeToolsList: (keyof ResearcherTools)[] = []
    let maxSteps: number
    let searchTool = originalSearchTool

    // Configure based on search mode
    switch (searchMode) {
      case 'quick':
        console.log(
          '[Researcher] Quick mode: maxSteps=20, tools=[search, fetch, writeScript, sourceFootage, cutBeats, listVoices, generateVoiceover, cloneVoice, generateMusic, generateImage, generateThumbnail, generateAvatar, composeRender]'
        )
        systemPrompt = getQuickModePrompt(relatedEnabled)
        activeToolsList = [
          'search',
          'fetch',
          'writeScript',
          'sourceFootage',
          'cutBeats',
          'listVoices',
          'generateVoiceover',
          'cloneVoice',
          'generateMusic',
          'generateImage',
          'generateThumbnail',
          'learnFromVideo',
          'generateAvatar',
          'composeRender'
        ]
        maxSteps = 20
        searchTool = wrapSearchToolForQuickMode(originalSearchTool)
        break

      case 'adaptive':
      default:
        systemPrompt = getAdaptiveModePrompt(relatedEnabled)
        activeToolsList = [
          'search',
          'fetch',
          'todoWrite',
          'writeScript',
          'sourceFootage',
          'cutBeats',
          'listVoices',
          'generateVoiceover',
          'cloneVoice',
          'generateMusic',
          'generateImage',
          'generateThumbnail',
          'learnFromVideo',
          'generateAvatar',
          'composeRender'
        ]
        console.log(
          `[Researcher] Adaptive mode: maxSteps=50, tools=[${activeToolsList.join(', ')}]`
        )
        maxSteps = 50
        searchTool = originalSearchTool
        break
    }

    // Kakkao producer layer: every kakkao capability stays (search, fetch, todos,
    // questions), retargeted at video production — search doubles as script research
    // and footage discovery.
    const kakkaoPrompt = `

## Kakkao video production & Style Selection
You are Kakkao, an agentic YouTube video producer built directly into this chat interface. When the user wants a video, script, or channel content:

0. MANDATORY VIDEO STYLE SELECTION (CRITICAL RULE):
   At the beginning of any video production workflow or script inquiry, ALWAYS ask the user to select their preferred Video Style unless they have already specified it.
   Present these 6 options clearly:
   1. 2D Animation
   2. Animated Explainer (Stick-figure documentaries that go viral)
   3. Avatar + Illustration (AI talking head presenter on the right in 9:16 format while the rest of the screen is B-rolls or AI generated)
   4. Cinematic B-roll (AI-directed multi-asset productions)
   5. B-roll Documentary (Stock footage narration videos)
   6. Storyboard Pack (Any story → scene stills + image-to-video prompts)

   *Remind the user that they can also share reference video URLs/links at any time for you to analyze and match their visual style, pacing, and hook structure.*

0b. LEARN FROM A VIDEO: if the user submits a YouTube URL to "learn from", "study", or "make one like this", call learnFromVideo FIRST. It watches the reference and returns a style template (hook, phase order, pacing, visual mix, narration devices). Feed those findings into writeScript (tone + researchNotes) and cutBeats so the new video mirrors the reference's structure.
1. RESEARCH FIRST: use the search and fetch tools to gather real facts, numbers, names, and competitor angles on the topic. Use todos to plan multi-step productions.
2. Then call writeScript with the topic, target minutes, language/tone (incorporating the chosen Video Style), and a distilled researchNotes summary of what you found — never write a script without researching unless the user insists.
3. VOICEOVER: call generateVoiceover with the finished script to produce narration audio with real word-level timings. It returns a voiceoverId — carry that id forward.
4. BEATS: call cutBeats to segment the script into an ordered storyboard of shots tailored to the chosen video style. Pass the voiceoverId so shot durations and captions lock to the actual spoken audio.
5. FOOTAGE & VISUALS BY STYLE:
   - For Avatar + Illustration: call generateAvatar for A-roll host segments (with presenter on right / 9:16 layout) and use sourceFootage/generateImage for the left/split canvas b-roll.
   - For Animated Explainer / 2D Animation / Storyboard Pack: generate scene stills & illustration assets matching the style description.
   - For Cinematic B-roll / B-roll Documentary: pool open archives and sourceFootage for dynamic stock footage & b-roll.
5b. GENERATED VISUALS: when no real footage fits a beat (abstract concepts, stylized scenes, or when sourceFootage comes up empty), call generateImage (gpt-image-2 via AI33) with a prompt tailored to the chosen video style to create stills for composeRender.
5c. A-ROLL / TALKING AVATAR: when the video calls for an A-roll talking presenter/host, call generateAvatar with the voiceoverId or audioUrl and an optional avatar portrait URL (synthesized via Modal-hosted MuseTalk).
6. MUSIC (optional): call generateMusic with a mood/genre prompt to create a background bed; pass its audioUrl as composeRender's music input (ducked automatically under narration).
7. RENDER: call composeRender with the storyboard shots (each carrying its resolved asset src, start, duration and words), the voiceoverId and music URL to produce the finished MP4 in chat.
8. THUMBNAIL (optional): call generateThumbnail (nano-banana-pro via AI33) with a click-worthy concept, optional bold titleText, and an optional referenceImageUrl to produce a 16:9 YouTube thumbnail.

The natural in-chat pipeline is Video Style Confirmation → writeScript → generateVoiceover → cutBeats (with voiceoverId) → sourceFootage / generateAvatar / generateImage → [generateMusic] → composeRender → [generateThumbnail]. Present returned scripts as-is and narrate progress through the pipeline in chat.`
    systemPrompt = systemPrompt + kakkaoPrompt

    // Build tools object with proper typing
    const tools: ResearcherTools = {
      search: searchTool,
      fetch: fetchTool,
      askQuestion: askQuestionTool,
      writeScript: writeScriptTool,
      sourceFootage: sourceFootageTool,
      cutBeats: cutBeatsTool,
      listVoices: listVoicesTool,
      generateVoiceover: generateVoiceoverTool,
      cloneVoice: cloneVoiceTool,
      generateMusic: generateMusicTool,
      generateImage: generateImageTool,
      generateThumbnail: generateThumbnailTool,
      learnFromVideo: learnFromVideoTool,
      generateAvatar: generateAvatarTool,
      composeRender: composeRenderTool,
      ...todoTools
    } as ResearcherTools

    // Create ToolLoopAgent with all configuration
    const agent = new ToolLoopAgent({
      model: getModel(model),
      instructions: `${systemPrompt}\nCurrent date and time: ${currentDate}`,
      tools,
      activeTools: activeToolsList,
      stopWhen: stepCountIs(maxSteps),
      ...(modelConfig?.providerOptions && {
        providerOptions: modelConfig.providerOptions
      }),
      experimental_telemetry: {
        isEnabled: isTracingEnabled(),
        functionId: 'research-agent',
        metadata: {
          modelId: model,
          agentType: 'researcher',
          searchMode,
          ...(parentTraceId && {
            langfuseTraceId: parentTraceId,
            langfuseUpdateParent: false
          })
        }
      }
    })

    return agent
  } catch (error) {
    console.error('Error in createResearcher:', error)
    throw error
  }
}

// Helper function to access agent tools
export function getResearcherTools(
  agent: ToolLoopAgent<never, ResearcherTools, never>
): ResearcherTools {
  return agent.tools
}

// Export the legacy function name for backward compatibility
export const researcher = createResearcher
