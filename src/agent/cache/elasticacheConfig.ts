import { sanitizeString } from '../../utils/sanitizer';
import { StoredCredentials } from '../credentials/types';
import { ElastiCacheConfig } from './types';

const ELASTICACHE_CREDENTIAL_KEYS = new Set([
  'ELASTICACHE_ENABLED',
  'ELASTICACHE_HOST',
  'ELASTICACHE_PORT',
  'ELASTICACHE_AUTH_TOKEN',
  'ELASTICACHE_TLS',
  'ELASTICACHE_KEY_PREFIX',
]);

export function isElasticacheCredentialKey(key: string): boolean {
  return ELASTICACHE_CREDENTIAL_KEYS.has(key);
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return value === 'true' || value === '1' || value.toLowerCase() === 'yes';
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65_535) {
    return fallback;
  }

  return parsed;
}

export function resolveElastiCacheConfig(
  storedCredentials?: StoredCredentials | null,
): ElastiCacheConfig | null {
  const stored = storedCredentials?.credentials ?? {};

  const enabled =
    parseBoolean(readEnv('DEVFORGE_ELASTICACHE_ENABLED'), false) ||
    parseBoolean(stored.ELASTICACHE_ENABLED, false);

  if (!enabled) {
    return null;
  }

  const host =
    readEnv('DEVFORGE_ELASTICACHE_HOST') ??
    stored.ELASTICACHE_HOST ??
    readEnv('ELASTICACHE_ENDPOINT');

  if (!host) {
    return null;
  }

  const port = parsePort(
    readEnv('DEVFORGE_ELASTICACHE_PORT') ?? stored.ELASTICACHE_PORT,
    6379,
  );
  const authToken =
    readEnv('DEVFORGE_ELASTICACHE_AUTH_TOKEN') ?? stored.ELASTICACHE_AUTH_TOKEN;
  const tls = parseBoolean(
    readEnv('DEVFORGE_ELASTICACHE_TLS') ?? stored.ELASTICACHE_TLS,
    true,
  );
  const keyPrefix = sanitizeString(
    readEnv('DEVFORGE_ELASTICACHE_KEY_PREFIX') ??
      stored.ELASTICACHE_KEY_PREFIX ??
      'devforge:agent:',
    64,
  );

  return {
    enabled: true,
    host: sanitizeString(host, 255),
    port,
    authToken: authToken ? sanitizeString(authToken, 512) : undefined,
    tls,
    keyPrefix,
    connectTimeoutMs: 5_000,
  };
}
