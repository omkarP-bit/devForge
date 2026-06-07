import Redis from 'ioredis';
import { StoredCredentials } from '../credentials/types';
import { resolveElastiCacheConfig } from './elasticacheConfig';
import { ElastiCacheConfig } from './types';

export interface ElastiCacheTestResult {
  configured: boolean;
  success: boolean;
  host?: string;
  port?: number;
  tls?: boolean;
  latencyMs?: number;
  message: string;
}

export function buildStoredCredentialsForCacheTest(
  credentials: Record<string, string>,
): StoredCredentials {
  return {
    provider: 'offline',
    credentials,
    setupAt: new Date().toISOString(),
    version: 1,
  };
}

export async function testElastiCacheConnection(options: {
  storedCredentials?: StoredCredentials | null;
  credentials?: Record<string, string>;
  config?: ElastiCacheConfig | null;
} = {}): Promise<ElastiCacheTestResult> {
  const stored =
    options.storedCredentials ??
    (options.credentials
      ? buildStoredCredentialsForCacheTest(options.credentials)
      : null);

  const config =
    options.config === undefined ? resolveElastiCacheConfig(stored) : options.config;

  if (!config) {
    return {
      configured: false,
      success: false,
      message:
        'ElastiCache is not configured. Run `devforge agent reset`, choose Amazon ElastiCache, or set DEVFORGE_ELASTICACHE_* environment variables.',
    };
  }

  const start = Date.now();
  let client: Redis | null = null;

  try {
    client = new Redis({
      host: config.host,
      port: config.port,
      password: config.authToken,
      tls: config.tls ? {} : undefined,
      connectTimeout: config.connectTimeoutMs,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    await client.connect();
    const pong = await client.ping();
    const latencyMs = Date.now() - start;

    if (pong !== 'PONG') {
      return {
        configured: true,
        success: false,
        host: config.host,
        port: config.port,
        tls: config.tls,
        latencyMs,
        message: `Unexpected PING response: ${String(pong)}`,
      };
    }

    return {
      configured: true,
      success: true,
      host: config.host,
      port: config.port,
      tls: config.tls,
      latencyMs,
      message: `Connected to ElastiCache at ${config.host}:${config.port} (${latencyMs}ms)`,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const detail = error instanceof Error ? error.message : 'Unknown connection error';

    return {
      configured: true,
      success: false,
      host: config.host,
      port: config.port,
      tls: config.tls,
      latencyMs,
      message: `Connection failed: ${detail}. Local file cache will be used as fallback.`,
    };
  } finally {
    await client?.quit().catch(() => undefined);
  }
}
