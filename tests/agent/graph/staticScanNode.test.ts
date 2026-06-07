import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createStaticScanNode } from '../../../src/agent/graph/nodes/staticScanNode';
import { createInitialGraphState } from '../../../src/agent/graph/types';
import { DevForgeFS } from '../../../src/utils/fs';

describe('staticScanNode', () => {
  it('runs static scanner on generated workflow files', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-static-scan-'));
    const fsAdapter = new DevForgeFS(tempDir);
    await fsAdapter.ensureDir('.github/workflows');
    await fsAdapter.writeFile(
      '.github/workflows/ci.yml',
      'name: CI\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout\n',
    );

    const node = createStaticScanNode({ fs: fsAdapter });
    const state = createInitialGraphState({
      context: {
        config: { projectRoot: tempDir } as never,
        generatedFiles: ['.github/workflows/ci.yml'],
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

    const update = await node(state);
    const violations = update.violations as unknown[] | undefined;
    expect(violations?.length ?? 0).toBeGreaterThan(0);

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
