import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { AgentCache } from '../../../src/agent/cache/AgentCache';
import { ElastiCacheConfig } from '../../../src/agent/cache/types';

const redisStore = new Map<string, string>();
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockPing = jest.fn().mockResolvedValue('PONG');
const mockGet = jest.fn(async (key: string) => redisStore.get(key) ?? null);
const mockSetex = jest.fn(async (key: string, _ttl: number, value: string) => {
  redisStore.set(key, value);
  return 'OK';
});
const mockScan = jest.fn(async (cursor: string) => {
  const keys = [...redisStore.keys()];
  if (cursor === '0') {
    return ['0', keys];
  }
  return ['0', []];
});
const mockDel = jest.fn(async (...keys: string[]) => {
  for (const key of keys) {
    redisStore.delete(key);
  }
  return keys.length;
});
const mockQuit = jest.fn().mockResolvedValue('OK');

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    status: 'ready',
    connect: mockConnect,
    ping: mockPing,
    get: mockGet,
    setex: mockSetex,
    scan: mockScan,
    del: mockDel,
    quit: mockQuit,
  }));
});

describe('AgentCache ElastiCache hybrid mode', () => {
  let tempDir: string;
  let cachePath: string;
  const elasticacheConfig: ElastiCacheConfig = {
    enabled: true,
    host: 'test.cache.amazonaws.com',
    port: 6379,
    tls: true,
    keyPrefix: 'devforge:test:',
    connectTimeoutMs: 1000,
  };

  beforeEach(async () => {
    redisStore.clear();
    jest.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-hybrid-cache-'));
    cachePath = path.join(tempDir, 'agent-cache.json');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('reads from ElastiCache before the local file cache', async () => {
    redisStore.set('devforge:test:remote-key', 'remote-value');
    const cache = new AgentCache({ cachePath, elasticache: elasticacheConfig });

    await expect(cache.get('remote-key')).resolves.toBe('remote-value');
    expect(mockGet).toHaveBeenCalledWith('devforge:test:remote-key');
  });

  it('falls back to local cache when ElastiCache misses', async () => {
    const cache = new AgentCache({ cachePath, elasticache: elasticacheConfig });
    await cache.set('local-only', 'local-value');

    redisStore.clear();
    await expect(cache.get('local-only')).resolves.toBe('local-value');
  });

  it('writes through to both local and ElastiCache backends', async () => {
    const cache = new AgentCache({ cachePath, elasticache: elasticacheConfig });
    await cache.set('shared-key', 'shared-value');

    expect(mockSetex).toHaveBeenCalled();
    await expect(cache.get('shared-key')).resolves.toBe('shared-value');

    const raw = await fs.readFile(cachePath, 'utf-8');
    expect(raw).toContain('shared-value');
    expect(redisStore.get('devforge:test:shared-key')).toBe('shared-value');
  });

  it('uses local cache when ElastiCache connection fails', async () => {
    mockConnect.mockRejectedValueOnce(new Error('connection refused'));
    const cache = new AgentCache({ cachePath, elasticache: elasticacheConfig });

    await cache.set('fallback-key', 'fallback-value');
    redisStore.clear();

    await expect(cache.get('fallback-key')).resolves.toBe('fallback-value');

    const stats = await cache.getStats();
    expect(stats.backend).toBe('local');
    expect(stats.elasticache.enabled).toBe(true);
    expect(stats.elasticache.connected).toBe(false);
    expect(stats.local.entryCount).toBe(1);
  });

  it('clears both local and ElastiCache entries', async () => {
    const cache = new AgentCache({ cachePath, elasticache: elasticacheConfig });
    await cache.set('clear-me', 'value');
    await cache.clear();

    await expect(cache.get('clear-me')).resolves.toBeNull();
    expect(redisStore.size).toBe(0);
  });
});
