import { StoredCredentials } from '../credentials/types';

export const DEFAULT_CACHE_TTL_MS = 86_400_000;

export interface CacheEntry {
  key: string;
  response: string;
  createdAt: number;
  ttlMs: number;
}

export interface AgentCacheFile {
  entries: CacheEntry[];
}

export interface ElastiCacheConfig {
  enabled: boolean;
  host: string;
  port: number;
  authToken?: string;
  tls: boolean;
  keyPrefix: string;
  connectTimeoutMs: number;
}

export interface AgentCacheOptions {
  cachePath?: string;
  storedCredentials?: StoredCredentials;
  elasticache?: ElastiCacheConfig | null;
}

export interface AgentCacheStats {
  entryCount: number;
  totalSizeKb: number;
  oldestEntryDate: string | null;
  backend: 'local' | 'elasticache' | 'hybrid';
  local: {
    entryCount: number;
    totalSizeKb: number;
  };
  elasticache: {
    enabled: boolean;
    connected: boolean;
    entryCount: number;
  };
}

export interface CacheBackend {
  get(key: string): Promise<string | null>;
  set(key: string, response: string, ttlMs?: number): Promise<void>;
  prune(): Promise<number>;
  clear(): Promise<void>;
  getStats(): Promise<Pick<AgentCacheStats, 'entryCount' | 'totalSizeKb' | 'oldestEntryDate'>>;
}
