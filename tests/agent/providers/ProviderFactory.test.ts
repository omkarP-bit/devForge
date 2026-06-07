import { AgentConfigError } from '../../../src/utils/errors';
import { resolveProvider } from '../../../src/agent/providers/ProviderFactory';
import { NovaProProvider } from '../../../src/agent/providers/NovaPro';
import { GeminiProvider } from '../../../src/agent/providers/Gemini';
import { OpenAIProvider } from '../../../src/agent/providers/OpenAI';
import { AnthropicProvider } from '../../../src/agent/providers/Anthropic';
import { BedrockProvider } from '../../../src/agent/providers/Bedrock';

describe('resolveProvider', () => {
  it('returns NovaProProvider for nova-pro', () => {
    const provider = resolveProvider({
      provider: 'nova-pro',
      credentials: { AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' },
    });
    expect(provider).toBeInstanceOf(NovaProProvider);
  });

  it('returns GeminiProvider for gemini', () => {
    const provider = resolveProvider({
      provider: 'gemini',
      credentials: { GEMINI_API_KEY: 'key' },
    });
    expect(provider).toBeInstanceOf(GeminiProvider);
  });

  it('returns OpenAIProvider for openai', () => {
    const provider = resolveProvider({
      provider: 'openai',
      credentials: { OPENAI_API_KEY: 'key' },
    });
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  it('returns AnthropicProvider for anthropic', () => {
    const provider = resolveProvider({
      provider: 'anthropic',
      credentials: { ANTHROPIC_API_KEY: 'key' },
    });
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  it('returns BedrockProvider for bedrock', () => {
    const provider = resolveProvider({
      provider: 'bedrock',
      credentials: {
        AWS_ACCESS_KEY_ID: 'a',
        AWS_SECRET_ACCESS_KEY: 'b',
        BEDROCK_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
      },
    });
    expect(provider).toBeInstanceOf(BedrockProvider);
  });

  it('throws AgentConfigError for offline mode', () => {
    expect(() =>
      resolveProvider({
        provider: 'offline',
        credentials: {},
      }),
    ).toThrow(AgentConfigError);
  });

  it('throws AgentConfigError for unknown provider', () => {
    expect(() =>
      resolveProvider({
        provider: 'unknown-provider' as 'nova-pro',
        credentials: {},
      }),
    ).toThrow(AgentConfigError);
  });
});
