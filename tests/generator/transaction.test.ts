import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { DevForgeFS } from '../../src/utils/fs';
import { rollbackTransaction } from '../../src/generator/transaction';

let tmpDir: string;
let devFS: DevForgeFS;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-tx-'));
  devFS = new DevForgeFS(tmpDir);
  // ensure transactions dir
  await fs.mkdir(path.join(tmpDir, '.devforge', 'transactions'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('rollbackTransaction', () => {
  it('removes generated files and restores previous contents', async () => {
    // Setup files and transaction
    const generatedPath = path.join(tmpDir, 'generated.txt');
    await fs.writeFile(generatedPath, 'new content', 'utf-8');

    const restoredPath = path.join(tmpDir, 'restored.txt');
    await fs.writeFile(restoredPath, 'current content', 'utf-8');

    const backupPath = path.join(tmpDir, 'backup.txt');
    // backup file does not exist yet

    const tx = {
      planHash: 'test-tx',
      transaction: [
        // write created file (no previousContent) — should be removed
        { path: 'generated.txt', action: 'write' },
        // write with previous content — should be restored
        { path: 'restored.txt', action: 'write', previousContent: 'old content' },
        // backup entry — should restore previousContent
        { path: 'backup.txt', action: 'backup', previousContent: 'backup content' },
      ],
    };

    const txFile = path.join(tmpDir, '.devforge', 'transactions', 'tx-test.json');
    await fs.writeFile(txFile, JSON.stringify(tx), 'utf-8');

    const messages = await rollbackTransaction(devFS, '.devforge/transactions/tx-test.json');

    // generated.txt should be removed
    await expect(fs.access(generatedPath)).rejects.toThrow();

    // restored.txt should contain previous content
    const restoredContent = await fs.readFile(restoredPath, 'utf-8');
    expect(restoredContent).toBe('old content');

    // backup.txt should now exist with backup content
    const backupContent = await fs.readFile(backupPath, 'utf-8');
    expect(backupContent).toBe('backup content');

    // messages should include expected strings
    expect(messages.some((m) => m.includes('Removed generated file'))).toBe(true);
    expect(messages.some((m) => m.includes('Restored previous content for restored.txt'))).toBe(true);
    expect(messages.some((m) => m.includes('Restored backup for backup.txt'))).toBe(true);
  });
});
