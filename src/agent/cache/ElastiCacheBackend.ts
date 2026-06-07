import Redis from 'ioredis';
import { ElastiCacheConfig } from './types';
import { DEFAULT_CACHE_TTL_MS } from './types';

export class ElastiCacheBackend {
  private client: Redis | null = null;
  private available = true;
  private connecting: Promise<boolean> | null = null;

  constructor(private readonly config: ElastiCacheConfig) {}

  isConfigured(): boolean {
    return this.config.enabled;
  }

  isConnected(): boolean {
    return this.client?.status === 'ready';
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.enabled || !this.available) {
      return false;
    }

    return this.ensureConnected();
  }

  markUnavailable(): void {
    this.available = false;
  }

  async get(key: string): Promise<string | null> {
    if (!(await this.isAvailable()) || !this.client) {
      return null;
    }

    try {
      return await this.client.get(this.redisKey(key));
    } catch {
      this.markUnavailable();
      return null;
    }
  }

  async set(key: string, response: string, ttlMs: number = DEFAULT_CACHE_TTL_MS): Promise<void> {
    if (!(await this.isAvailable()) || !this.client) {
      return;
    }

    const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));

    try {
      await this.client.setex(this.redisKey(key), ttlSeconds, response);
    } catch {
      this.markUnavailable();
    }
  }

  async prune(): Promise<number> {
    return 0;
  }

  async clear(): Promise<void> {
    if (!(await this.isAvailable()) || !this.client) {
      return;
    }

    const pattern = `${this.config.keyPrefix}*`;
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (cursor !== '0');
  }

  async getStats(): Promise<{
    entryCount: number;
    totalSizeKb: number;
    oldestEntryDate: string | null;
  }> {
    if (!(await this.isAvailable()) || !this.client) {
      return {
        entryCount: 0,
        totalSizeKb: 0,
        oldestEntryDate: null,
      };
    }

    try {
      const pattern = `${this.config.keyPrefix}*`;
      let cursor = '0';
      let entryCount = 0;

      do {
        const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        entryCount += keys.length;
      } while (cursor !== '0');

      return {
        entryCount,
        totalSizeKb: 0,
        oldestEntryDate: null,
      };
    } catch {
      this.markUnavailable();
      return {
        entryCount: 0,
        totalSizeKb: 0,
        oldestEntryDate: null,
      };
    }
  }

  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    await this.client.quit().catch(() => undefined);
    this.client = null;
  }

  private redisKey(key: string): string {
    return `${this.config.keyPrefix}${key}`;
  }

  private async ensureConnected(): Promise<boolean> {
    if (this.client?.status === 'ready') {
      return true;
    }

    if (!this.connecting) {
      this.connecting = this.connect();
    }

    const connected = await this.connecting;
    this.connecting = null;
    return connected;
  }

  private async connect(): Promise<boolean> {
    try {
      this.client = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.authToken,
        tls: this.config.tls ? {} : undefined,
        connectTimeout: this.config.connectTimeoutMs,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableOfflineQueue: false,
      });

      await this.client.connect();
      await this.client.ping();
      return true;
    } catch {
      this.markUnavailable();
      await this.disconnect();
      return false;
    }
  }
}
