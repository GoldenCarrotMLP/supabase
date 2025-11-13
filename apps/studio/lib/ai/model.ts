import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import { LanguageModel } from 'ai'
import { checkAwsCredentials, createRoutedBedrock } from './bedrock'
import {
  BedrockModel,
  Model,
  OpenAIModel,
  GeminiModel,
  PROVIDERS,
  ProviderModelConfig,
  ProviderName,
  getDefaultModelForProvider,
} from './model.utils'

type PromptProviderOptions = Record<string, any>
type ProviderOptions = Record<string, any>

type ModelSuccess = {
  model: LanguageModel
  promptProviderOptions?: PromptProviderOptions
  providerOptions?: ProviderOptions
  error?: never
}

export type ModelError = {
  model?: never
  promptProviderOptions?: never
  providerOptions?: never
  error: Error
}

type ModelResponse = ModelSuccess | ModelError

export const ModelErrorMessage = 'No valid AI model available based on available credentials.'

export type GetModelParams = {
  provider?: ProviderName
  model?: Model
  routingKey: string
  isLimited?: boolean
}

/**
 * Retrieves a LanguageModel from a specific provider and model.
 * - If provider/model not specified, auto-selects based on available credentials (prefers Bedrock).
 * - If isLimited is true, uses the provider's default model.
 * - Returns promptProviderOptions that callers can attach to the system message.
 */
export async function getModel({
  provider,
  model,
  routingKey,
  isLimited = true,
}: GetModelParams): Promise<ModelResponse> {
  const envThrottled = process.env.IS_THROTTLED !== 'false'

  let preferredProvider: ProviderName | undefined = provider

  const hasAwsCredentials = await checkAwsCredentials()
  const hasAwsBedrockRoleArn = !!process.env.AWS_BEDROCK_ROLE_ARN
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY
  const hasGeminiKey = !!process.env.GEMINI_API_KEY

  // Auto-pick a provider if not specified defaulting to Bedrock
  if (!preferredProvider) {
    if (hasAwsBedrockRoleArn && hasAwsCredentials) {
      preferredProvider = 'bedrock'
    } else if (hasOpenAIKey) {
      preferredProvider = 'openai'
    }
    else if (hasGeminiKey) {
      preferredProvider = 'google'
    }
  }

  if (!preferredProvider) {
    return { error: new Error(ModelErrorMessage) }
  }

  const providerRegistry = PROVIDERS[preferredProvider]
  if (!providerRegistry) {
    return { error: new Error(`Unknown provider: ${preferredProvider}`) }
  }

  const models = providerRegistry.models as Record<Model, ProviderModelConfig>

  const useDefault = isLimited || envThrottled || !model || !models[model]

  const chosenModelId = useDefault ? getDefaultModelForProvider(preferredProvider) : model

  if (preferredProvider === 'bedrock') {
    if (!hasAwsBedrockRoleArn || !hasAwsCredentials) {
      return { error: new Error('AWS Bedrock credentials not available') }
    }
    const bedrock = createRoutedBedrock(routingKey)
    const model = await bedrock(chosenModelId as BedrockModel)
    const promptProviderOptions = (
      providerRegistry.models as Record<BedrockModel, ProviderModelConfig>
    )[chosenModelId as BedrockModel]?.promptProviderOptions
    return { model, promptProviderOptions }
  }

  if (preferredProvider === 'openai') {
    if (!hasOpenAIKey) {
      return { error: new Error('OPENAI_API_KEY not available') }
    }
    return {
      model: openai(chosenModelId as OpenAIModel),
      promptProviderOptions: models[chosenModelId as OpenAIModel]?.promptProviderOptions,
      providerOptions: providerRegistry.providerOptions,
    }
  }

  if (preferredProvider === 'google') {  
  if (!hasGeminiKey) {  
    return { error: new Error('GEMINI_API_KEY not available') }  
  }  
  const google = createGoogleGenerativeAI({  
    apiKey: process.env.GEMINI_API_KEY,  
  })  
  return {  
    model: google(chosenModelId as GeminiModel),  
    promptProviderOptions: models[chosenModelId as GeminiModel]?.promptProviderOptions,  
    providerOptions: providerRegistry.providerOptions,  
  }  
}

  return { error: new Error(`Unsupported provider: ${preferredProvider}`) }
}
