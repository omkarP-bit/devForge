import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  AgentCache,
  DEFAULT_CACHE_TTL_MS,
} from '../../../src/agent/cache/AgentCache';
import { buildCacheKey } from '../../../src/agent/cache/cacheKey';

describe('buildCacheKey', () => {
  it('returns a stable SHA-256 hash for the same inputs', () => {
    const first = buildCacheKey('agent', 'prompt', 'message');
    const second = buildCacheKey('agent', 'prompt', 'message');
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it('changes when any input changes', () => {
    const base = buildCacheKey('agent', 'prompt', 'message');
    expect(buildCacheKey('agent-2', 'prompt', 'message')).not.toBe(base);
    expect(buildCacheKey('agent', 'prompt-2', 'message')).not.toBe(base);
    expect(buildCacheKey('agent', 'prompt', 'message-2')).not.toBe(base);
  });
});

describe('AgentCache', () => {
  let tempDir: string;
  let cachePath: string;
  let cache: AgentCache;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-agent-cache-'));
    cachePath = path.join(tempDir, 'agent-cache.json');
    cache = new AgentCache({ cachePath });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('stores and retrieves cached responses by key', async () => {
    await cache.set('test-key', 'cached-response');
    await expect(cache.get('test-key')).resolves.toBe('cached-response');
  });

  it('returns null for missing keys', async () => {
    await expect(cache.get('missing-key')).resolves.toBeNull();
  });

  it('prune() removes expired entries and returns the pruned count', async () => {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(
      cachePath,
      JSON.stringify({
        entries: [
          {
            key: 'expired-key',
            response: 'old-value',
            createdAt: Date.now() - 25 * 60 * 60 * 1000,
            ttlMs: DEFAULT_CACHE_TTL_MS,
          },
          {
            key: 'fresh-key',
            response: 'new-value',
            createdAt: Date.now(),
            ttlMs: DEFAULT_CACHE_TTL_MS,
          },
        ],
      }),
      'utf-8',
    );

    const pruned = await cache.prune();
    expect(pruned).toBe(1);
    await expect(cache.get('fresh-key')).resolves.toBe('new-value');
    await expect(cache.get('expired-key')).resolves.toBeNull();
  });

  it('clear() removes all cache entries', async () => {
    await cache.set('one', 'value-1');
    await cache.set('two', 'value-2');
    await cache.clear();

    await expect(cache.get('one')).resolves.toBeNull();
    await expect(cache.get('two')).resolves.toBeNull();
  });

  it('getStats() reports entry count, size, and oldest entry date', async () => {
    await cache.set('older-key', 'older-response');
    await cache.set('newer-key', 'newer-response');

    const stats = await cache.getStats();
    expect(stats.local.entryCount).toBe(2);
    expect(stats.local.totalSizeKb).toBeGreaterThan(0);
    expect(stats.oldestEntryDate).not.toBeNull();
    expect(stats.backend).toBe('local');
    expect(stats.elasticache.enabled).toBe(false);
  });

  it('appends entries for the same key and returns the newest valid response', async () => {
    await cache.set('duplicate-key', 'first-response');
    await cache.set('duplicate-key', 'second-response');

    await expect(cache.get('duplicate-key')).resolves.toBe('second-response');
  });
});
