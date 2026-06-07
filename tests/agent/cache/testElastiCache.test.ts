import Redis from 'ioredis';
import { testElastiCacheConnection } from '../../../src/agent/cache/testElastiCache';

jest.mock('ioredis');

const MockedRedis = Redis as unknown as jest.Mock;

describe('testElastiCacheConnection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports not configured when ElastiCache is disabled', async () => {
    const result = await testElastiCacheConnection({
      credentials: { ELASTICACHE_ENABLED: 'false' },
    });

    expect(result.configured).toBe(false);
    expect(result.success).toBe(false);
    expect(result.message).toContain('not configured');
    expect(MockedRedis).not.toHaveBeenCalled();
  });

  it('reports success when Redis PING succeeds', async () => {
    const connect = jest.fn().mockResolvedValue(undefined);
    const ping = jest.fn().mockResolvedValue('PONG');
    const quit = jest.fn().mockResolvedValue(undefined);

    MockedRedis.mockImplementation(() => ({
      connect,
      ping,
      quit,
    }));

    const result = await testElastiCacheConnection({
      credentials: {
        ELASTICACHE_ENABLED: 'true',
        ELASTICACHE_HOST: 'cluster.cache.amazonaws.com',
        ELASTICACHE_PORT: '6379',
        ELASTICACHE_TLS: 'true',
      },
    });

    expect(result.configured).toBe(true);
    expect(result.success).toBe(true);
    expect(result.host).toBe('cluster.cache.amazonaws.com');
    expect(result.port).toBe(6379);
    expect(result.tls).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(connect).toHaveBeenCalled();
    expect(ping).toHaveBeenCalled();
    expect(quit).toHaveBeenCalled();
  });

  it('reports failure when Redis connection throws', async () => {
    MockedRedis.mockImplementation(() => ({
      connect: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      ping: jest.fn(),
      quit: jest.fn().mockResolvedValue(undefined),
    }));

    const result = await testElastiCacheConnection({
      credentials: {
        ELASTICACHE_ENABLED: 'true',
        ELASTICACHE_HOST: 'unreachable.cache.amazonaws.com',
        ELASTICACHE_PORT: '6379',
        ELASTICACHE_TLS: 'false',
      },
    });

    expect(result.configured).toBe(true);
    expect(result.success).toBe(false);
    expect(result.message).toContain('ECONNREFUSED');
    expect(result.message).toContain('fallback');
  });
});
