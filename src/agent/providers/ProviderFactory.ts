import { AgentConfigError } from '../../utils/errors';
import { AnthropicProvider } from './Anthropic';
import { BedrockProvider } from './Bedrock';
import { GeminiProvider } from './Gemini';
import { NovaProProvider } from './NovaPro';
import { OpenAIProvider } from './OpenAI';
import { DevForgeAgentConfig, LLMProvider } from './types';

export function resolveProvider(config: DevForgeAgentConfig): LLMProvider {
  switch (config.provider) {
    case 'nova-pro':
      return new NovaProProvider(config.credentials);
    case 'gemini':
      return new GeminiProvider(config.credentials);
    case 'openai':
      return new OpenAIProvider(config.credentials);
    case 'anthropic':
      return new AnthropicProvider(config.credentials);
    case 'bedrock':
      return new BedrockProvider(config.credentials);
    case 'offline':
      throw new AgentConfigError('Offline mode does not use an LLM provider');
    default:
      throw new AgentConfigError(`Unknown provider: ${config.provider as string}`);
  }
}
