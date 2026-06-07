export type AgentProviderName =
  | 'nova-pro'
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'bedrock'
  | 'offline';

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface DevForgeAgentConfig {
  provider: AgentProviderName;
  credentials: Record<string, string>;
}

export interface LLMProvider {
  name: string;
  chat(messages: AgentMessage[], options?: ChatOptions): Promise<string>;
  isAvailable(): Promise<boolean>;
}
