import { RecommendationAgent } from '../agents';
import { SecurityComplianceAgent } from '../agents/SecurityComplianceAgent';
import { AgentCache } from '../cache/AgentCache';
import { StoredCredentials } from '../credentials/types';
import { resolveProvider } from '../providers/ProviderFactory';
import { LLMProvider } from '../providers/types';
import { RecommendationStore } from '../RecommendationStore';
import { DevForgeFS } from '../../utils/fs';

export interface PostInitGraphDependencies {
  createProvider?: (credentials: StoredCredentials) => LLMProvider;
  createRecommendationAgent?: (input: {
    provider: LLMProvider;
    credentials: StoredCredentials;
    cache: AgentCache;
    recommendationStore: RecommendationStore;
  }) => Pick<RecommendationAgent, 'run'>;
  createSecurityAgent?: (input: {
    provider: LLMProvider;
    credentials: StoredCredentials;
    cache: AgentCache;
    readFile: (path: string) => Promise<string>;
  }) => Pick<SecurityComplianceAgent, 'run'>;
}

export function createDefaultProvider(credentials: StoredCredentials): LLMProvider {
  if (credentials.provider === 'offline') {
    return {
      name: 'offline',
      chat: async () => '',
      isAvailable: async () => false,
    };
  }

  return resolveProvider({
    provider: credentials.provider,
    credentials: credentials.credentials,
  });
}

export function createDefaultRecommendationAgent(input: {
  provider: LLMProvider;
  credentials: StoredCredentials;
  cache: AgentCache;
  recommendationStore: RecommendationStore;
}): Pick<RecommendationAgent, 'run'> {
  return new RecommendationAgent(
    input.provider,
    input.credentials,
    input.cache,
    input.recommendationStore,
  );
}

export function createDefaultSecurityAgent(input: {
  provider: LLMProvider;
  credentials: StoredCredentials;
  cache: AgentCache;
  readFile: (path: string) => Promise<string>;
}): Pick<SecurityComplianceAgent, 'run'> {
  return new SecurityComplianceAgent(
    input.provider,
    input.credentials,
    input.cache,
    input.readFile,
  );
}

export function createReadFile(fs: DevForgeFS): (path: string) => Promise<string> {
  return (filePath: string) => fs.readFile(filePath);
}
