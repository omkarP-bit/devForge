import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  InMemoryGraphCheckpointer,
  LocalFileGraphCheckpointer,
} from '../../../src/agent/graph/checkpointing';
import { createInitialGraphState } from '../../../src/agent/graph/types';

describe('graph checkpointing', () => {
  it('stores and loads state in memory', async () => {
    const checkpointer = new InMemoryGraphCheckpointer();
    const state = createInitialGraphState({
      context: {
        config: {} as never,
        generatedFiles: [],
        lastRunJson: null,
        failureSignals: [],
      },
      credentials: {
        provider: 'offline',
        credentials: {},
        setupAt: new Date().toISOString(),
        version: 1,
      },
    });

    await checkpointer.save('ns-1', state);
    const loaded = await checkpointer.load('ns-1');
    expect(loaded?.phase).toBe('idle');
    await checkpointer.clear('ns-1');
    await expect(checkpointer.load('ns-1')).resolves.toBeNull();
  });

  it('persists checkpoints to a local JSON file', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-checkpoint-'));
    const filePath = path.join(tempDir, 'graph-checkpoints.json');
    const checkpointer = new LocalFileGraphCheckpointer(filePath);
    const state = createInitialGraphState({
      context: {
        config: {} as never,
        generatedFiles: [],
        lastRunJson: null,
        failureSignals: [],
      },
      credentials: {
        provider: 'offline',
        credentials: {},
        setupAt: new Date().toISOString(),
        version: 1,
      },
    });

    await checkpointer.save('project-a', state);
    const reloaded = new LocalFileGraphCheckpointer(filePath);
    const loaded = await reloaded.load('project-a');
    expect(loaded?.metadata.graphVersion).toBe(2);

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
