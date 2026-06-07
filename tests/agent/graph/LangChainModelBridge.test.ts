import { ChatAnthropic } from '@langchain/anthropic';
import { ChatBedrockConverse } from '@langchain/aws';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import {
  getLangChainProviderId,
  LANGCHAIN_PROVIDER_IDS,
  toLangChainChatModel,
} from '../../../src/agent/graph/LangChainModelBridge';
import { StoredCredentials } from '../../../src/agent/credentials/types';

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation((config: Record<string, unknown>) => ({
    provider: 'openai',
    config,
  })),
}));

jest.mock('@langchain/anthropic', () => ({
  ChatAnthropic: jest.fn().mockImplementation((config: Record<string, unknown>) => ({
    provider: 'anthropic',
    config,
  })),
}));

jest.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: jest.fn().mockImplementation((config: Record<string, unknown>) => ({
    provider: 'gemini',
    config,
  })),
}));

jest.mock('@langchain/aws', () => ({
  ChatBedrockConverse: jest.fn().mockImplementation((config: Record<string, unknown>) => ({
    provider: 'bedrock',
    config,
  })),
}));

const mockedChatOpenAI = ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>;
const mockedChatAnthropic = ChatAnthropic as jest.MockedClass<typeof ChatAnthropic>;
const mockedChatGoogle = ChatGoogleGenerativeAI as jest.MockedClass<typeof ChatGoogleGenerativeAI>;
const mockedChatBedrock = ChatBedrockConverse as jest.MockedClass<typeof ChatBedrockConverse>;

function stored(provider: StoredCredentials['provider'], credentials: Record<string, string>): StoredCredentials {
  return {
    provider,
    credentials,
    setupAt: new Date().toISOString(),
    version: 1,
  };
}

describe('LangChainModelBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null for offline provider', () => {
    expect(toLangChainChatModel(stored('offline', {}))).toBeNull();
    expect(getLangChainProviderId('offline')).toBeNull();
  });

  it('maps openai credentials to ChatOpenAI without logging secrets', () => {
    const model = toLangChainChatModel(stored('openai', { OPENAI_API_KEY: 'sk-test-secret' }));

    expect(model).toEqual(
      expect.objectContaining({
        provider: 'openai',
        config: expect.objectContaining({ apiKey: 'sk-test-secret' }),
      }),
    );
    expect(mockedChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-test-secret',
        model: 'gpt-4o-mini',
        timeout: 30_000,
      }),
    );
    expect(JSON.stringify(mockedChatOpenAI.mock.calls)).not.toContain('logged');
  });

  it('maps anthropic credentials to ChatAnthropic', () => {
    toLangChainChatModel(stored('anthropic', { ANTHROPIC_API_KEY: 'anthropic-key' }));
    expect(mockedChatAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'anthropic-key',
        model: 'claude-3-5-haiku-20241022',
      }),
    );
  });

  it('maps gemini credentials to ChatGoogleGenerativeAI', () => {
    toLangChainChatModel(stored('gemini', { GEMINI_API_KEY: 'gemini-key' }));
    expect(mockedChatGoogle).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'gemini-key',
        model: 'gemini-1.5-flash',
      }),
    );
  });

  it('maps nova-pro credentials to ChatBedrockConverse', () => {
    toLangChainChatModel(
      stored('nova-pro', {
        AWS_ACCESS_KEY_ID: 'AKIA',
        AWS_SECRET_ACCESS_KEY: 'secret',
        AWS_REGION: 'us-west-2',
      }),
    );

    expect(mockedChatBedrock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'amazon.nova-pro-v1:0',
        region: 'us-west-2',
      }),
    );
  });

  it('maps bedrock credentials using BEDROCK_MODEL_ID', () => {
    toLangChainChatModel(
      stored('bedrock', {
        AWS_ACCESS_KEY_ID: 'AKIA',
        AWS_SECRET_ACCESS_KEY: 'secret',
        BEDROCK_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
      }),
    );

    expect(mockedChatBedrock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'anthropic.claude-3-haiku-20240307-v1:0',
      }),
    );
  });

  it('returns null when required credentials are missing', () => {
    expect(toLangChainChatModel(stored('openai', {}))).toBeNull();
    expect(
      toLangChainChatModel(
        stored('bedrock', {
          AWS_ACCESS_KEY_ID: 'AKIA',
          AWS_SECRET_ACCESS_KEY: 'secret',
        }),
      ),
    ).toBeNull();
  });

  it('exposes provider ids for all online providers', () => {
    expect(LANGCHAIN_PROVIDER_IDS.openai).toBe('openai');
    expect(getLangChainProviderId('bedrock')).toBe('bedrock');
  });
});
