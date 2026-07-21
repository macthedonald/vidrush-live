import { anthropic } from '@ai-sdk/anthropic'
import { createGateway } from '@ai-sdk/gateway'
import { google } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createProviderRegistry, LanguageModel } from 'ai'
import { createOllama } from 'ai-sdk-ollama'

// Strip a trailing /v1 from the configured base URL, then re-append it,
// so both shapes work for OpenAI-compatible hosts:
//   OPENAI_COMPATIBLE_API_BASE_URL=https://api.deepseek.com
//   OPENAI_COMPATIBLE_API_BASE_URL=https://api.deepseek.com/v1
function normalizeOpenAICompatibleBaseURL(raw: string): string {
  return raw.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1'
}

// Build providers object conditionally
const providers: Record<string, any> = {
  openai,
  anthropic,
  google,
  'openai-compatible': createOpenAICompatible({
    // Keep the SDK provider key stable. OPENAI_COMPATIBLE_PROVIDER_NAME is
    // only a UI label used by the model selector.
    name: 'openai-compatible',
    apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
    baseURL: normalizeOpenAICompatibleBaseURL(
      process.env.OPENAI_COMPATIBLE_API_BASE_URL || ''
    )
  }),
  gateway: createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY
  })
}

// Only add Ollama if OLLAMA_BASE_URL is configured
const ollamaProvider = process.env.OLLAMA_BASE_URL
  ? createOllama({ baseURL: process.env.OLLAMA_BASE_URL })
  : null

if (ollamaProvider) {
  providers.ollama = ollamaProvider
}

export const registry = createProviderRegistry(providers)

export function getModel(model: string): LanguageModel {
  let targetModel = (model || '').trim()

  // Ensure target model starts with a provider prefix if missing
  if (!targetModel.includes(':')) {
    if (targetModel.startsWith('claude')) {
      targetModel = `anthropic:${targetModel}`
    } else if (
      targetModel.startsWith('gpt') ||
      targetModel.startsWith('o1') ||
      targetModel.startsWith('o3') ||
      targetModel.startsWith('o4')
    ) {
      targetModel = `openai:${targetModel}`
    } else if (targetModel.startsWith('gemini')) {
      targetModel = `google:${targetModel}`
    } else {
      // Default prefix
      targetModel = `google:${targetModel}`
    }
  }

  // Normalize Anthropic model aliases
  if (targetModel.startsWith('anthropic:')) {
    const rawId = targetModel.slice('anthropic:'.length)
    if (
      rawId === 'claude-sonnet-5' ||
      rawId === 'claude-5' ||
      rawId === 'claude-sonnet' ||
      rawId === 'claude-3-5-sonnet' ||
      rawId === 'claude-3-sonnet'
    ) {
      targetModel = 'anthropic:claude-3-5-sonnet-latest'
    }
  }

  // Normalize Google model aliases / unknown preview names
  if (targetModel.startsWith('google:')) {
    const rawId = targetModel.slice('google:'.length)
    if (
      rawId.includes('3.1') ||
      rawId.includes('preview') ||
      rawId === 'gemini-3.1-flash-lite' ||
      rawId === 'gemini-3-flash-preview'
    ) {
      targetModel = 'google:gemini-2.5-flash'
    }
  }

  // Provider fallback: if the target provider is missing an API key, route to an active provider
  const provider = targetModel.split(':')[0]
  if (!isProviderEnabled(provider)) {
    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      targetModel = 'google:gemini-2.5-flash'
    } else if (process.env.OPENAI_API_KEY) {
      targetModel = 'openai:gpt-4o'
    } else if (process.env.ANTHROPIC_API_KEY) {
      targetModel = 'anthropic:claude-3-5-sonnet-latest'
    }
  }

  // For Ollama models, bypass the registry to pass model-level settings
  if (targetModel.startsWith('ollama:') && ollamaProvider) {
    const modelId = targetModel.slice('ollama:'.length)
    const lm = ollamaProvider(modelId, { think: true })

    Object.defineProperty(lm, 'supportedUrls', {
      value: {},
      configurable: true
    })

    return lm
  }

  return registry.languageModel(
    targetModel as Parameters<typeof registry.languageModel>[0]
  )
}

export function isProviderEnabled(providerId: string): boolean {
  switch (providerId) {
    case 'openai':
      return !!process.env.OPENAI_API_KEY
    case 'anthropic':
      return !!process.env.ANTHROPIC_API_KEY
    case 'google':
      return !!process.env.GOOGLE_GENERATIVE_AI_API_KEY
    case 'openai-compatible':
      return (
        !!process.env.OPENAI_COMPATIBLE_API_KEY &&
        !!process.env.OPENAI_COMPATIBLE_API_BASE_URL
      )
    case 'gateway':
      return !!process.env.AI_GATEWAY_API_KEY
    case 'ollama':
      return !!process.env.OLLAMA_BASE_URL
    default:
      return false
  }
}
