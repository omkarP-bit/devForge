import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { diagnoseCommand } from '../../src/cli/diagnoseCommand';
import { DevForgeFS } from '../../src/utils/fs';

describe('diagnoseCommand', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-diagnose-cli-'));
    const fsAdapter = new DevForgeFS(tempDir);
    await fsAdapter.ensureDir('.devforge');
    await fsAdapter.writeFile(
      '.devforge/last-run.json',
      JSON.stringify({
        generationResult: { written: [], skipped: [], backed_up: [], errors: [] },
        planHash: 'abc',
        timestamp: new Date().toISOString(),
      }),
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    process.env.DEVFORGE_USE_LANGGRAPH = 'false';
  });

  it('prints deterministic JSON output with --no-agent', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await diagnoseCommand(tempDir, { noAgent: true, json: true });

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('"mode": "deterministic"');

    logSpy.mockRestore();
  });
});
