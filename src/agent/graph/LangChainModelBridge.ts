import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatBedrockConverse } from '@langchain/aws';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { StoredCredentials } from '../credentials/types';
import { AgentProviderName } from '../providers/types';
import { CHAT_TIMEOUT_MS } from '../providers/timeout';

const OPENAI_MODEL = 'gpt-4o-mini';
const ANTHROPIC_MODEL = 'claude-3-5-haiku-20241022';
const GEMINI_MODEL = 'gemini-1.5-flash';
const NOVA_MODEL = 'amazon.nova-pro-v1:0';

export const LANGCHAIN_PROVIDER_IDS: Record<Exclude<AgentProviderName, 'offline'>, string> = {
  'nova-pro': 'nova-pro',
  gemini: 'gemini',
  openai: 'openai',
  anthropic: 'anthropic',
  bedrock: 'bedrock',
};

export function getLangChainProviderId(
  provider: AgentProviderName,
): string | null {
  if (provider === 'offline') {
    return null;
  }

  return LANGCHAIN_PROVIDER_IDS[provider];
}

/**
 * Maps DevForge stored credentials to a LangChain chat model for graph nodes.
 * Returns null for offline mode or when required credentials are missing.
 */
export function toLangChainChatModel(credentials: StoredCredentials): BaseChatModel | null {
  if (credentials.provider === 'offline') {
    return null;
  }

  const creds = credentials.credentials;

  switch (credentials.provider) {
    case 'openai': {
      const apiKey = creds.OPENAI_API_KEY;
      if (!apiKey) {
        return null;
      }

      return new ChatOpenAI({
        apiKey,
        model: OPENAI_MODEL,
        timeout: CHAT_TIMEOUT_MS,
        maxRetries: 1,
      });
    }
    case 'anthropic': {
      const apiKey = creds.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return null;
      }

      return new ChatAnthropic({
        apiKey,
        model: ANTHROPIC_MODEL,
        clientOptions: { timeout: CHAT_TIMEOUT_MS },
        maxRetries: 1,
      });
    }
    case 'gemini': {
      const apiKey = creds.GEMINI_API_KEY;
      if (!apiKey) {
        return null;
      }

      return new ChatGoogleGenerativeAI({
        apiKey,
        model: GEMINI_MODEL,
        maxRetries: 1,
      });
    }
    case 'nova-pro': {
      return createBedrockModel(creds, NOVA_MODEL);
    }
    case 'bedrock': {
      const modelId = creds.BEDROCK_MODEL_ID ?? creds.MODEL_ID;
      if (!modelId) {
        return null;
      }

      return createBedrockModel(creds, modelId);
    }
    default:
      return null;
  }
}

function createBedrockModel(
  creds: Record<string, string>,
  model: string,
): ChatBedrockConverse | null {
  const accessKeyId = creds.AWS_ACCESS_KEY_ID;
  const secretAccessKey = creds.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    return null;
  }

  return new ChatBedrockConverse({
    model,
    region: creds.AWS_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    maxRetries: 1,
  });
}
