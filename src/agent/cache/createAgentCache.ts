import { StoredCredentials } from '../credentials/types';
import { AgentCache } from './AgentCache';
import { AgentCacheOptions } from './types';

export function createAgentCache(
  storedCredentials?: StoredCredentials | null,
  options: Omit<AgentCacheOptions, 'storedCredentials'> = {},
): AgentCache {
  return AgentCache.fromCredentials(storedCredentials, options);
}
