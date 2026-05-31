import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

describe('CLI rollback dry-run', () => {
  const cliPath = path.resolve(__dirname, '../../dist/cli/index.js');
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-rollback-'));
    await fs.mkdir(path.join(tmpDir, '.devforge', 'transactions'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('does not delete files during dry-run rollback', async () => {
    // create generated file and tx
    const genFile = path.join(tmpDir, 'generated.txt');
    await fs.writeFile(genFile, 'new content', 'utf-8');

    const tx = {
      planHash: 'tx1',
      transaction: [{ path: 'generated.txt', action: 'write' }],
    };
    const txPath = path.join(tmpDir, '.devforge', 'transactions', 'tx1.json');
    await fs.writeFile(txPath, JSON.stringify(tx), 'utf-8');

    const { stdout, stderr } = await execAsync(`node "${cliPath}" rollback --tx .devforge/transactions/tx1.json --dry-run`, {
      cwd: tmpDir,
      env: { ...process.env, NODE_ENV: 'development' },
    } as any);

    // File should still exist
    const content = await fs.readFile(genFile, 'utf-8');
    expect(content).toBe('new content');

    // Output should indicate dry-run completion
    expect(String(stdout) + String(stderr)).toMatch(/dry-run/i);
  });
});
