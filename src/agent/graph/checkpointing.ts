import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { ElastiCacheBackend } from '../cache/ElastiCacheBackend';
import { resolveElastiCacheConfig } from '../cache/elasticacheConfig';
import { StoredCredentials } from '../credentials/types';
import { resolveGraphCheckpointPath } from './GraphMemory';
import { DevForgeGraphState } from './types';

type CheckpointStore = Record<string, DevForgeGraphState>;

export class InMemoryGraphCheckpointer {
  private readonly store = new Map<string, DevForgeGraphState>();

  async save(namespace: string, state: DevForgeGraphState): Promise<void> {
    this.store.set(namespace, state);
  }

  async load(namespace: string): Promise<DevForgeGraphState | null> {
    return this.store.get(namespace) ?? null;
  }

  async clear(namespace: string): Promise<void> {
    this.store.delete(namespace);
  }
}

export class LocalFileGraphCheckpointer {
  constructor(private readonly filePath: string = resolveGraphCheckpointPath()) {}

  async save(namespace: string, state: DevForgeGraphState): Promise<void> {
    const store = await this.readStore();
    // eslint-disable-next-line security/detect-object-injection
    store[namespace] = state;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  async load(namespace: string): Promise<DevForgeGraphState | null> {
    const store = await this.readStore();
    // eslint-disable-next-line security/detect-object-injection
    return store[namespace] ?? null;
  }

  async clear(namespace: string): Promise<void> {
    const store = await this.readStore();
    // eslint-disable-next-line security/detect-object-injection
    delete store[namespace];
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  private async readStore(): Promise<CheckpointStore> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as CheckpointStore;
    } catch {
      return {};
    }
  }
}

export class ElasticacheGraphCheckpointer {
  private backend: ElastiCacheBackend | null = null;

  constructor(storedCredentials?: StoredCredentials | null) {
    const config = resolveElastiCacheConfig(storedCredentials ?? null);
    if (config) {
      this.backend = new ElastiCacheBackend({
        ...config,
        keyPrefix: 'devforge:graph:',
      });
    }
  }

  async save(namespace: string, state: DevForgeGraphState): Promise<void> {
    if (!this.backend || !(await this.backend.isAvailable())) {
      return;
    }

    await this.backend.set(namespace, JSON.stringify(state));
  }

  async load(namespace: string): Promise<DevForgeGraphState | null> {
    if (!this.backend || !(await this.backend.isAvailable())) {
      return null;
    }

    const raw = await this.backend.get(namespace);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as DevForgeGraphState;
  }

  async clear(namespace: string): Promise<void> {
    if (!this.backend || !(await this.backend.isAvailable())) {
      return;
    }

    await this.backend.set(namespace, '');
  }

  async disconnect(): Promise<void> {
    await this.backend?.disconnect();
  }
}

export class CompositeGraphCheckpointer {
  constructor(
    private readonly primary: ElasticacheGraphCheckpointer,
    private readonly fallback: LocalFileGraphCheckpointer,
  ) {}

  async save(namespace: string, state: DevForgeGraphState): Promise<void> {
    await Promise.all([
      this.primary.save(namespace, state),
      this.fallback.save(namespace, state),
    ]);
  }

  async load(namespace: string): Promise<DevForgeGraphState | null> {
    const elastic = await this.primary.load(namespace);
    if (elastic) {
      return elastic;
    }

    return this.fallback.load(namespace);
  }

  async clear(namespace: string): Promise<void> {
    await Promise.all([this.primary.clear(namespace), this.fallback.clear(namespace)]);
  }

  async disconnect(): Promise<void> {
    await this.primary.disconnect();
  }
}

export function createGraphCheckpointer(
  credentials?: StoredCredentials | null,
): CompositeGraphCheckpointer {
  return new CompositeGraphCheckpointer(
    new ElasticacheGraphCheckpointer(credentials),
    new LocalFileGraphCheckpointer(),
  );
}
