import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { RecommendationStore } from '../../src/agent/RecommendationStore';
import {
  recommendationsDismissCommand,
  recommendationsListCommand,
} from '../../src/cli/recommendationsCommand';
import { DevForgeFS } from '../../src/utils/fs';

describe('recommendationsCommand', () => {
  let tempDir: string;
  let devFS: DevForgeFS;
  let store: RecommendationStore;
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-rec-cli-'));
    devFS = new DevForgeFS(tempDir);
    store = new RecommendationStore(devFS, '2.0.0');
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    logSpy.mockRestore();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('lists stored recommendations grouped by status', async () => {
    await store.save([
      {
        type: 'security',
        severity: 'critical',
        title: 'Pin actions',
        description: 'Pin GitHub Actions by SHA',
        autoFixAvailable: true,
      },
    ]);

    await recommendationsListCommand(tempDir, { fs: devFS, store });

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('DevForge Recommendations');
    expect(output).toContain('Pin actions');
    expect(output).toContain('New');
  });

  it('dismisses a recommendation by id', async () => {
    await store.save([
      {
        type: 'optimization',
        severity: 'low',
        title: 'Cache deps',
        description: 'Enable dependency caching',
        autoFixAvailable: true,
      },
    ]);

    const id = (await store.load())[0]?.id;
    expect(id).toBeTruthy();

    await recommendationsDismissCommand(tempDir, id!, { fs: devFS, store });

    const updated = await store.load();
    expect(updated[0]?.status).toBe('dismissed');
    expect(logSpy.mock.calls.map((call) => String(call[0])).join('\n')).toContain('Dismissed recommendation');
  });
});
