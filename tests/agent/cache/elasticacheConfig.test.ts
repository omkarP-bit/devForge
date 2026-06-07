import {
  isElasticacheCredentialKey,
  resolveElastiCacheConfig,
} from '../../../src/agent/cache/elasticacheConfig';
import { StoredCredentials } from '../../../src/agent/credentials/types';

describe('resolveElastiCacheConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DEVFORGE_ELASTICACHE_ENABLED;
    delete process.env.DEVFORGE_ELASTICACHE_HOST;
    delete process.env.DEVFORGE_ELASTICACHE_PORT;
    delete process.env.DEVFORGE_ELASTICACHE_AUTH_TOKEN;
    delete process.env.DEVFORGE_ELASTICACHE_TLS;
    delete process.env.DEVFORGE_ELASTICACHE_KEY_PREFIX;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns null when ElastiCache is disabled', () => {
    expect(resolveElastiCacheConfig()).toBeNull();
  });

  it('returns null when ElastiCache is explicitly disabled in stored credentials', () => {
    const stored: StoredCredentials = {
      provider: 'openai',
      credentials: {
        ELASTICACHE_ENABLED: 'false',
        ELASTICACHE_HOST: 'should-not-be-used.cache.amazonaws.com',
      },
      setupAt: new Date().toISOString(),
      version: 1,
    };

    expect(resolveElastiCacheConfig(stored)).toBeNull();
  });

  it('resolves config from environment variables', () => {
    process.env.DEVFORGE_ELASTICACHE_ENABLED = 'true';
    process.env.DEVFORGE_ELASTICACHE_HOST = 'my-cluster.cache.amazonaws.com';
    process.env.DEVFORGE_ELASTICACHE_PORT = '6380';
    process.env.DEVFORGE_ELASTICACHE_AUTH_TOKEN = 'secret-token';
    process.env.DEVFORGE_ELASTICACHE_TLS = 'true';

    const config = resolveElastiCacheConfig();
    expect(config).toEqual({
      enabled: true,
      host: 'my-cluster.cache.amazonaws.com',
      port: 6380,
      authToken: 'secret-token',
      tls: true,
      keyPrefix: 'devforge:agent:',
      connectTimeoutMs: 5000,
    });
  });

  it('resolves config from stored credentials', () => {
    const stored: StoredCredentials = {
      provider: 'openai',
      credentials: {
        OPENAI_API_KEY: 'key',
        ELASTICACHE_ENABLED: 'true',
        ELASTICACHE_HOST: 'redis.internal',
        ELASTICACHE_PORT: '6379',
        ELASTICACHE_TLS: 'false',
      },
      setupAt: new Date().toISOString(),
      version: 1,
    };

    const config = resolveElastiCacheConfig(stored);
    expect(config?.host).toBe('redis.internal');
    expect(config?.tls).toBe(false);
  });

  it('identifies elasticache credential keys', () => {
    expect(isElasticacheCredentialKey('ELASTICACHE_HOST')).toBe(true);
    expect(isElasticacheCredentialKey('OPENAI_API_KEY')).toBe(false);
  });
});
