import { readFile } from 'fs/promises';
import * as path from 'path';

describe('package release hardening', () => {
  it('uses the expected publish settings', async () => {
    const raw = await readFile(path.resolve(__dirname, '../package.json'), 'utf-8');
    const packageJson = JSON.parse(raw) as {
      files?: string[];
      engines?: { node?: string };
      license?: string;
      scripts?: Record<string, string>;
    };

    expect(packageJson.files).toEqual(['dist/', 'docs/', 'README.md', 'LICENSE', 'CHANGELOG.md']);
    expect(packageJson.engines?.node).toBe('>=18.0.0');
    expect(packageJson.license).toBe('MIT');
    expect(packageJson.scripts?.prepublishOnly).toBe('npm run build && npm run lint && npm run test');
    expect(packageJson.scripts?.postinstall).toBe('');
  });
});
