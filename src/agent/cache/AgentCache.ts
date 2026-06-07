import { StoredCredentials } from '../credentials/types';
import { ElastiCacheBackend } from './ElastiCacheBackend';
import { resolveElastiCacheConfig } from './elasticacheConfig';
import { LocalFileCache } from './LocalFileCache';
import {
  AgentCacheOptions,
  AgentCacheStats,
  DEFAULT_CACHE_TTL_MS,
} from './types';

export { DEFAULT_CACHE_TTL_MS } from './types';
export type { AgentCacheOptions, AgentCacheStats, ElastiCacheConfig } from './types';

export class AgentCache {
  readonly cachePath: string;
  private readonly local: LocalFileCache;
  private readonly elasticache: ElastiCacheBackend | null;

  constructor(options: AgentCacheOptions = {}) {
    this.local = new LocalFileCache({ cachePath: options.cachePath });
    this.cachePath = this.local.cachePath;

    const elasticacheConfig =
      options.elasticache === undefined
        ? resolveElastiCacheConfig(options.storedCredentials)
        : options.elasticache;

    this.elasticache = elasticacheConfig ? new ElastiCacheBackend(elasticacheConfig) : null;
  }

  static fromCredentials(
    storedCredentials?: StoredCredentials | null,
    options: Omit<AgentCacheOptions, 'storedCredentials'> = {},
  ): AgentCache {
    return new AgentCache({
      ...options,
      storedCredentials: storedCredentials ?? undefined,
    });
  }

  async get(key: string): Promise<string | null> {
    if (this.elasticache) {
      const remoteValue = await this.elasticache.get(key);
      if (remoteValue !== null) {
        return remoteValue;
      }
    }

    return this.local.get(key);
  }

  async set(key: string, response: string, ttlMs: number = DEFAULT_CACHE_TTL_MS): Promise<void> {
    await this.local.set(key, response, ttlMs);

    if (this.elasticache) {
      await this.elasticache.set(key, response, ttlMs);
    }
  }

  async prune(): Promise<number> {
    const localPruned = await this.local.prune();

    if (this.elasticache) {
      await this.elasticache.prune();
    }

    return localPruned;
  }

  async clear(): Promise<void> {
    await this.local.clear();

    if (this.elasticache) {
      await this.elasticache.clear();
    }
  }

  async getStats(): Promise<AgentCacheStats> {
    const localStats = await this.local.getStats();
    const elasticacheStats = this.elasticache
      ? await this.elasticache.getStats()
      : { entryCount: 0, totalSizeKb: 0, oldestEntryDate: null };

    const elasticacheEnabled = this.elasticache?.isConfigured() ?? false;
    const elasticacheConnected = this.elasticache?.isConnected() ?? false;

    let backend: AgentCacheStats['backend'] = 'local';
    if (elasticacheEnabled && elasticacheConnected) {
      backend = localStats.entryCount > 0 ? 'hybrid' : 'elasticache';
    }

    return {
      entryCount: localStats.entryCount + elasticacheStats.entryCount,
      totalSizeKb: localStats.totalSizeKb,
      oldestEntryDate: localStats.oldestEntryDate,
      backend,
      local: {
        entryCount: localStats.entryCount,
        totalSizeKb: localStats.totalSizeKb,
      },
      elasticache: {
        enabled: elasticacheEnabled,
        connected: elasticacheConnected,
        entryCount: elasticacheStats.entryCount,
      },
    };
  }
}
