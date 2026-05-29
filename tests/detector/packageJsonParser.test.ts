import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { DevForgeFS } from '../../src/utils';
import { parsePackageJson } from '../../src/detector/packageJsonParser';
import { DetectionError } from '../../src/utils/errors';

let tmpDir: string;
let devFS: DevForgeFS;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-test-package-json-'));
  devFS = new DevForgeFS(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('parsePackageJson', () => {
  it('successfully parses a valid package.json', async () => {
    const pkgContent = {
      name: 'test-project',
      version: '1.2.3',
      dependencies: {
        react: '^18.2.0',
      },
      devDependencies: {
        typescript: '^5.0.0',
      },
      scripts: {
        build: 'tsc',
      },
    };
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkgContent), 'utf-8');

    const parsed = await parsePackageJson(devFS);
    expect(parsed.name).toBe('test-project');
    expect(parsed.version).toBe('1.2.3');
    expect(parsed.dependencies).toEqual({ react: '^18.2.0' });
    expect(parsed.devDependencies).toEqual({ typescript: '^5.0.0' });
    expect(parsed.scripts).toEqual({ build: 'tsc' });
    expect(parsed.hasField('react')).toBe(true);
    expect(parsed.hasField('typescript')).toBe(true);
    expect(parsed.hasField('jest')).toBe(false);
    expect(parsed.getDependencyVersion('react')).toBe('^18.2.0');
    expect(parsed.getDependencyVersion('typescript')).toBe('^5.0.0');
    expect(parsed.getDependencyVersion('jest')).toBeNull();
    expect(parsed.hasScript('build')).toBe(true);
    expect(parsed.hasScript('test')).toBe(false);
  });

  it('defaults missing optional fields to empty object', async () => {
    const pkgContent = {
      name: 'simple-project',
      version: '0.0.1',
    };
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkgContent), 'utf-8');

    const parsed = await parsePackageJson(devFS);
    expect(parsed.name).toBe('simple-project');
    expect(parsed.version).toBe('0.0.1');
    expect(parsed.dependencies).toEqual({});
    expect(parsed.devDependencies).toEqual({});
    expect(parsed.scripts).toEqual({});
    expect(parsed.hasField('any-dep')).toBe(false);
    expect(parsed.getDependencyVersion('any-dep')).toBeNull();
    expect(parsed.hasScript('any-script')).toBe(false);
  });

  it('throws DetectionError when JSON is malformed', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), '{ malformed json: ', 'utf-8');

    await expect(parsePackageJson(devFS)).rejects.toThrow(DetectionError);
    await expect(parsePackageJson(devFS)).rejects.toThrow('Invalid package.json: not valid JSON');
  });

  it('throws DetectionError when package.json does not exist', async () => {
    await expect(parsePackageJson(devFS)).rejects.toThrow(DetectionError);
    await expect(parsePackageJson(devFS)).rejects.toThrow('Failed to read package.json');
  });

  it('throws DetectionError when file is over 512KB', async () => {
    const largeContent = 'a'.repeat(524289);
    await fs.writeFile(path.join(tmpDir, 'package.json'), largeContent, 'utf-8');

    await expect(parsePackageJson(devFS)).rejects.toThrow(DetectionError);
    await expect(parsePackageJson(devFS)).rejects.toThrow('Failed to read package.json');
  });

  it('throws DetectionError when Zod validation fails (e.g., dependencies is not a record)', async () => {
    const pkgContent = {
      name: 'bad-project',
      version: '1.0.0',
      dependencies: 'not-an-object',
    };
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkgContent), 'utf-8');

    await expect(parsePackageJson(devFS)).rejects.toThrow(DetectionError);
    await expect(parsePackageJson(devFS)).rejects.toThrow('Invalid package.json schema');
  });
});
