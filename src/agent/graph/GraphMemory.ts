import { createHash } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { DevForgeFS } from '../../utils/fs';
import { GraphNodeTiming } from './graphObservability';

const MEMORY_FILE = '.devforge/graph-memory.json';

export interface GraphMemoryRecord {
  projectNamespace: string;
  phase: string;
  startedAt: string;
  completedAt: string;
  nodeTimings: GraphNodeTiming[];
  recommendationCount: number;
  securityWarningCount: number;
  violationCount: number;
  storedRecommendationIds: string[];
  errors: string[];
}

export class GraphMemory {
  constructor(
    private readonly fs: DevForgeFS,
    private readonly projectRoot: string,
  ) {}

  getProjectNamespace(): string {
    return createHash('sha256').update(path.resolve(this.projectRoot)).digest('hex').slice(0, 16);
  }

  async saveRun(
    record: Omit<GraphMemoryRecord, 'projectNamespace'>,
  ): Promise<GraphMemoryRecord> {
    const persisted: GraphMemoryRecord = {
      ...record,
      projectNamespace: this.getProjectNamespace(),
    };

    await this.fs.ensureDir('.devforge');
    await this.fs.writeFile(MEMORY_FILE, JSON.stringify(persisted, null, 2));
    return persisted;
  }

  async loadLastRun(): Promise<GraphMemoryRecord | null> {
    if (!(await this.fs.fileExists(MEMORY_FILE))) {
      return null;
    }

    try {
      const raw = await this.fs.readFile(MEMORY_FILE);
      return JSON.parse(raw) as GraphMemoryRecord;
    } catch {
      return null;
    }
  }

  async clear(): Promise<void> {
    if (await this.fs.fileExists(MEMORY_FILE)) {
      await this.fs.removeFile(MEMORY_FILE);
    }
  }
}

export function resolveGraphCheckpointPath(): string {
  const configDir = process.env.DEVFORGE_CONFIG_DIR?.trim();
  const baseDir = configDir && configDir.length > 0 ? configDir : path.join(os.homedir(), '.devforge');
  return path.join(baseDir, 'graph-checkpoints.json');
}

export async function clearGlobalGraphCheckpoints(projectNamespace: string): Promise<void> {
  const checkpointPath = resolveGraphCheckpointPath();
  try {
    const raw = await readFile(checkpointPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // eslint-disable-next-line security/detect-object-injection
    delete parsed[projectNamespace];
    await mkdir(path.dirname(checkpointPath), { recursive: true });
    await writeFile(checkpointPath, JSON.stringify(parsed, null, 2), 'utf-8');
  } catch (error) {
    const errno = (error as NodeJS.ErrnoException).code;
    if (errno !== 'ENOENT') {
      throw error;
    }
  }
}

export async function clearAllGlobalGraphCheckpoints(): Promise<void> {
  const checkpointPath = resolveGraphCheckpointPath();
  try {
    await unlink(checkpointPath);
  } catch (error) {
    const errno = (error as NodeJS.ErrnoException).code;
    if (errno !== 'ENOENT') {
      throw error;
    }
  }
}
