import { cacheTestElasticacheCommand } from '../../src/cli/cacheCommand';

jest.mock('../../src/agent/cache/testElastiCache', () => ({
  testElastiCacheConnection: jest.fn(),
}));

const { testElastiCacheConnection } = jest.requireMock(
  '../../src/agent/cache/testElastiCache',
) as { testElastiCacheConnection: jest.Mock };

describe('cacheTestElasticacheCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns exit code 0 when connectivity succeeds', async () => {
    testElastiCacheConnection.mockResolvedValue({
      configured: true,
      success: true,
      host: 'cluster.cache.amazonaws.com',
      port: 6379,
      tls: true,
      latencyMs: 18,
      message: 'Connected to ElastiCache at cluster.cache.amazonaws.com:6379 (18ms)',
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await expect(cacheTestElasticacheCommand()).resolves.toBe(0);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('ElastiCache Connectivity Test');
    expect(output).toContain('cluster.cache.amazonaws.com:6379');

    logSpy.mockRestore();
  });

  it('returns exit code 1 when ElastiCache is not configured', async () => {
    testElastiCacheConnection.mockResolvedValue({
      configured: false,
      success: false,
      message: 'ElastiCache is not configured.',
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await expect(cacheTestElasticacheCommand()).resolves.toBe(1);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('not configured');

    logSpy.mockRestore();
  });

  it('returns exit code 1 when connectivity fails', async () => {
    testElastiCacheConnection.mockResolvedValue({
      configured: true,
      success: false,
      host: 'cluster.cache.amazonaws.com',
      port: 6379,
      tls: true,
      latencyMs: 5000,
      message: 'Connection failed: timeout',
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await expect(cacheTestElasticacheCommand()).resolves.toBe(1);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('Connection failed');

    logSpy.mockRestore();
  });
});
