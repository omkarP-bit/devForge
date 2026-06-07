import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { GraphMemory } from '../../src/agent/graph/GraphMemory';
import { agentGraphResetCommand, agentGraphStatusCommand } from '../../src/cli/graphCommand';
import { DevForgeFS } from '../../src/utils/fs';

describe('graphCommand', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-graph-cli-'));
    const fsAdapter = new DevForgeFS(tempDir);
    const memory = new GraphMemory(fsAdapter, tempDir);
    await memory.saveRun({
      phase: 'complete',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      nodeTimings: [{ node: 'security', durationMs: 12 }],
      recommendationCount: 1,
      securityWarningCount: 0,
      violationCount: 0,
      storedRecommendationIds: ['rec-1'],
      errors: [],
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('prints graph status for the current project', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await agentGraphStatusCommand({ projectRoot: tempDir });

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('DevForge Agent Graph');
    expect(output).toContain('Last phase: complete');

    logSpy.mockRestore();
  });

  it('clears graph memory on reset', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await agentGraphResetCommand({ projectRoot: tempDir });

    const fsAdapter = new DevForgeFS(tempDir);
    const memory = new GraphMemory(fsAdapter, tempDir);
    await expect(memory.loadLastRun()).resolves.toBeNull();

    logSpy.mockRestore();
  });
});
