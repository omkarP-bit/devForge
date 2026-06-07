import { AgentProviderName } from './providers/types';

const PROVIDER_LABELS: Record<AgentProviderName, string> = {
  'nova-pro': 'Amazon Nova Pro',
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  bedrock: 'Amazon Bedrock',
  offline: 'Offline',
};

export function formatProviderName(provider: AgentProviderName): string {
  return PROVIDER_LABELS[provider];
}

export function getProviderMode(provider: AgentProviderName): string {
  return provider === 'offline' ? 'Offline' : 'Online';
}

export function maskCredential(value: string): string {
  if (value.length === 0) {
    return '****';
  }

  if (value.length <= 4) {
    return `${value}***`;
  }

  return `${value.slice(0, 4)}***`;
}
