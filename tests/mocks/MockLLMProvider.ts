import { AgentMessage, ChatOptions, LLMProvider } from '../../src/agent/providers/types';

export interface MockLLMResponse {
  recommendations: Array<{
    type: 'update' | 'security' | 'optimization';
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    autoFixAvailable: boolean;
  }>;
  expectedOutputs: string[];
}

export const DEFAULT_MOCK_RESPONSE: MockLLMResponse = {
  recommendations: [
    {
      type: 'security',
      severity: 'critical',
      title: 'Pin GitHub Actions',
      description: 'Pin all third-party actions to immutable commit SHAs.',
      autoFixAvailable: true,
    },
    {
      type: 'optimization',
      severity: 'low',
      title: 'Enable dependency caching',
      description: 'Cache node_modules between workflow runs.',
      autoFixAvailable: true,
    },
  ],
  expectedOutputs: [
    'Install dependencies via npm ci',
    'Run tests via jest --ci',
    'Build the production bundle',
    'Deploy to Vercel',
  ],
};

export interface MockLLMProviderOptions {
  fail?: boolean;
  response?: MockLLMResponse;
}

export class MockLLMProvider implements LLMProvider {
  readonly name = 'mock-llm';
  readonly chat: jest.Mock<Promise<string>, [AgentMessage[], ChatOptions?]>;
  readonly isAvailable: jest.Mock<Promise<boolean>, []>;
  private readonly response: MockLLMResponse;

  constructor(options: MockLLMProviderOptions = {}) {
    this.response = options.response ?? DEFAULT_MOCK_RESPONSE;
    this.chat = jest.fn().mockResolvedValue(JSON.stringify(this.response));
    this.isAvailable = jest.fn().mockResolvedValue(!options.fail);
  }

  static create(options: MockLLMProviderOptions = {}): MockLLMProvider {
    return new MockLLMProvider(options);
  }
}
