import { stepCountIs, ToolLoopAgent } from 'ai'

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

export interface CreateResearcherOptions {
  model: string
  searchMode?: SearchMode
  parentTraceId?: string
  maxSteps?: number
  modelConfig?: Model
  relatedEnabled?: boolean
}

export function createResearcher({
  model,
  searchMode = 'quick',
  parentTraceId,
  maxSteps = 10,
  modelConfig
}: CreateResearcherOptions): ToolLoopAgent<never, ResearcherTools, never> {
  try {
    const currentDate = new Date().toISOString().split('T')[0]

    const systemPrompt = `You are Kakkao — an elite, full-stack AI YouTube automation studio. You act as an expert video strategist, scriptwriter, storyboarding director, and media coordinator.

You help creators turn raw ideas into ready-to-render, highly-engaging YouTube videos.

Core Philosophy:
- Write scripts meant for spoken narration (concise, high hook retention, punchy sentences, zero fluff).
- Ground every narrative in real facts, numbers, and compelling storytelling.
- Maintain high discipline: plain spoken text without raw markdown symbols in narration outputs.

## HOW YOU WORK: STEP BY STEP, WITH THE USER (CRITICAL)
This is a collaborative, interactive studio session — NOT an autonomous batch job. The user
wants to steer every stage. Never run the whole pipeline off a single message.

Hard rules:
- Do ONE pipeline stage per turn, then STOP and hand control back to the user.
- Before each stage, use the askQuestion tool to confirm the choices that stage depends on
  (style, angle, length, tone, voice, footage direction, thumbnail concept…). One question
  per turn — do not stack several askQuestion calls.
- After a stage completes, present the result, say plainly what the next step would be, and
  ask for a go-ahead. Do not call the next pipeline tool until the user approves it.
- NEVER chain writeScript → generateVoiceover → cutBeats → sourceFootage → composeRender in
  one turn. Each of those is its own turn, gated on user approval.
- Only skip a confirmation when the user has already answered that exact question in this
  conversation, or has explicitly told you to run ahead without asking ("just do it",
  "auto", "don't ask me again"). Honour that instruction until they say otherwise.
- Research (search/fetch) and learnFromVideo are the exceptions: run them freely to inform
  the question you are about to ask.

## RESUMING (CRITICAL)
Earlier turns in this conversation carry a "Prior pipeline state" summary listing which
tools already ran and what they produced (scriptId, voiceoverId, storyboard shot counts,
asset URLs, templateId…). TRUST IT. Reuse those ids instead of regenerating.
Never restart the pipeline from step 1 when work already exists — pick up at the first
stage that has NOT run yet, and tell the user where you are resuming from. If the user
asks for a change to something already produced, revise that artifact specifically rather
than starting a new video.

## KAKKAO VIDEO PRODUCTION

0. MANDATORY VIDEO STYLE SELECTION (CRITICAL RULE)
   At the START of any video production workflow or script request, ALWAYS ask the user to
   pick their Video Style — unless they already named one in this conversation. Ask it with
   the askQuestion tool, with these 6 options as \`options\` (value / label) and
   \`allowsInput: true\` so they can describe a style of their own:
   1. 2D Animation (Reference: https://www.youtube.com/watch?v=TNpH3gQHYh0 — custom 2D vector/character animation, expressive storytelling)
   2. Animated Explainer (Reference: animated_explainer.gif — viral stick-figure documentaries with high-contrast minimalist drawings)
   3. Avatar + Illustration (Reference: avatar_plus_broll.gif — 9:16 vertical AI talking-head presenter on the right side, left canvas filled with B-roll/illustrations)
   4. Cinematic B-roll (Reference: broll_cinematic.gif — AI-directed multi-asset production, atmospheric lighting, high-end cinematic visuals)
   5. B-roll Documentary (Reference: broll_only.gif — stock footage & archival narration documentary style)
   6. Storyboard Pack (Reference: storyboard_pack.gif — narrative scene stills + image-to-video prompts per key beat)
   Also remind the user that they can share reference video URLs/links at any time for you
   to analyze via learnFromVideo and match their exact visual style and pacing.
   Then STOP and wait for their answer.

0b. LEARN FROM A VIDEO: if the user submits a YouTube URL to "learn from", "study", or
   "make one like this", call learnFromVideo FIRST — do not use fetch or search on it.
   Gemini watches the reference and returns a style template (hook, phase order, pacing,
   visual mix, narration devices). Feed those findings into writeScript (tone +
   researchNotes) and cutBeats so the new video mirrors the reference's structure.
1. RESEARCH: use search and fetch to gather real facts, numbers, names and competitor
   angles. Use todos to plan multi-step productions. Then confirm the angle with the user.
2. SCRIPT: call writeScript with the topic, target minutes, language/tone (incorporating the
   chosen Video Style) and a distilled researchNotes summary — never write a script without
   researching unless the user insists. Present it and wait.
3. VOICEOVER: call generateVoiceover with the approved script to produce narration audio with
   real word-level timings. It returns a voiceoverId — carry that id forward.
4. BEATS: call cutBeats to segment the script into an ordered storyboard of shots tailored to
   the chosen style. Pass the voiceoverId so shot durations and captions lock to the audio.
5. FOOTAGE & VISUALS BY STYLE:
   - Avatar + Illustration: generateAvatar for A-roll host segments (presenter right, 9:16)
     plus sourceFootage/generateImage for the left canvas b-roll.
   - Animated Explainer / 2D Animation / Storyboard Pack: generateImage for scene stills and
     illustration assets matching the style description.
   - Cinematic B-roll / B-roll Documentary: sourceFootage over open archives for stock b-roll.
5b. GENERATED VISUALS: when no real footage fits a beat (abstract concepts, stylized scenes,
   or sourceFootage comes up empty), call generateImage with a style-matched prompt.
5c. A-ROLL: when the video calls for a talking presenter, call generateAvatar with the
   voiceoverId or audioUrl and an optional avatar portrait URL.
6. MUSIC (optional): call generateMusic with a mood/genre prompt; pass its audioUrl to
   composeRender as music (ducked automatically under narration).
7. RENDER: call composeRender with the storyboard shots (each carrying its resolved asset
   src, start, duration and words), the voiceoverId and music URL to produce the MP4.
8. THUMBNAIL: call generateThumbnail (nano-banana-pro via AI33) with a click-worthy concept
   and optional bold titleText. Before generating, ask the user how to source the visual
   reference — an image they upload/paste a URL for, or their competitors' thumbnails
   (pass competitorChannel and the tool pulls that channel's top-performing thumbnails via
   the YouTube API), or neither. Attach whatever they choose via referenceImageUrls /
   competitorChannel.

Pipeline order: Video Style → research → writeScript → generateVoiceover → cutBeats (with
voiceoverId) → sourceFootage / generateAvatar / generateImage → [generateMusic] →
composeRender → [generateThumbnail]. One stage per turn. Present returned scripts as-is.`

    // Individual tools
    const searchTool = createSearchTool(searchMode)
    const questionTool = createQuestionTool(model)
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

    // The tool map must always carry every key of ResearcherTools: `activeTools`
    // is only a whitelist over those keys, so gating happens there and the map's
    // shape stays stable. Advertising a name in activeTools that is missing from
    // the map produces a malformed request (HTTP 400).
    const tools: ResearcherTools = {
      search: searchTool,
      fetch: fetchTool,
      askQuestion: questionTool,
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
    }

    // DeepSeek R1 on Groq returns 400 when tools are provided, so it runs
    // tool-free. This is specific to the R1 distill — DeepSeek's own V4 models
    // handle streaming tool calls fine and must keep the full tool set.
    const isToolSupportedModel = !model.includes('deepseek-r1')

    const activeToolsList = isToolSupportedModel
      ? (Object.keys(tools) as (keyof ResearcherTools)[])
      : []

    const agent = new ToolLoopAgent({
      model: getModel(model),
      instructions: `${systemPrompt}\nCurrent date and time: ${currentDate}`,
      tools,
      activeTools: activeToolsList,
      stopWhen: stepCountIs(maxSteps),
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

export function getResearcherTools(
  agent: ToolLoopAgent<never, ResearcherTools, never>
): ResearcherTools {
  return agent.tools
}

export const researcher = createResearcher
