import { access, mkdir, readFile, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

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

export interface AgentCacheOptions {
  cachePath?: string;
}

export interface AgentCacheStats {
  entryCount: number;
  totalSizeKb: number;
  oldestEntryDate: string | null;
}

function getDefaultCachePath(): string {
  if (process.env.DEVFORGE_AGENT_CACHE_PATH) {
    return process.env.DEVFORGE_AGENT_CACHE_PATH;
  }

  return path.join(os.homedir(), '.devforge', 'agent-cache.json');
}

function isEntryValid(entry: CacheEntry, now: number = Date.now()): boolean {
  const ageMs = now - entry.createdAt;
  return ageMs >= 0 && ageMs < entry.ttlMs;
}

export class AgentCache {
  readonly cachePath: string;

  constructor(options: AgentCacheOptions = {}) {
    this.cachePath = options.cachePath ?? getDefaultCachePath();
  }

  async get(key: string): Promise<string | null> {
    const file = await this.load();
    const match = file.entries
      .filter((entry) => entry.key === key && isEntryValid(entry))
      .sort((left, right) => right.createdAt - left.createdAt)[0];

    return match?.response ?? null;
  }

  async set(key: string, response: string, ttlMs: number = DEFAULT_CACHE_TTL_MS): Promise<void> {
    const file = await this.load();
    file.entries.push({
      key,
      response,
      createdAt: Date.now(),
      ttlMs,
    });

    await this.persist(file);
  }

  async prune(): Promise<number> {
    const file = await this.load();
    const validEntries = file.entries.filter((entry) => isEntryValid(entry));
    const prunedCount = file.entries.length - validEntries.length;

    if (prunedCount > 0) {
      await this.persist({ entries: validEntries });
    }

    return prunedCount;
  }

  async clear(): Promise<void> {
    await this.persist({ entries: [] });
  }

  async getStats(): Promise<AgentCacheStats> {
    const file = await this.load();
    const validEntries = file.entries.filter((entry) => isEntryValid(entry));

    let fileSizeBytes = 0;
    try {
      const raw = await readFile(this.cachePath, 'utf-8');
      fileSizeBytes = Buffer.byteLength(raw, 'utf8');
    } catch {
      fileSizeBytes = 0;
    }

    const oldestTimestamp =
      validEntries.length > 0
        ? Math.min(...validEntries.map((entry) => entry.createdAt))
        : null;

    return {
      entryCount: validEntries.length,
      totalSizeKb: Math.round((fileSizeBytes / 1024) * 100) / 100,
      oldestEntryDate:
        oldestTimestamp === null ? null : new Date(oldestTimestamp).toISOString(),
    };
  }

  private async load(): Promise<AgentCacheFile> {
    try {
      await access(this.cachePath);
      const raw = await readFile(this.cachePath, 'utf-8');
      const parsed = JSON.parse(raw) as AgentCacheFile;

      if (!parsed.entries || !Array.isArray(parsed.entries)) {
        return { entries: [] };
      }

      return parsed;
    } catch {
      return { entries: [] };
    }
  }

  private async persist(file: AgentCacheFile): Promise<void> {
    await mkdir(path.dirname(this.cachePath), { recursive: true });
    await writeFile(this.cachePath, JSON.stringify(file, null, 2), 'utf-8');
  }
}
