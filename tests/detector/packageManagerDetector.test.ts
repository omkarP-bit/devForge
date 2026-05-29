import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { DevForgeFS } from '../../src/utils';
import { PackageManager } from '../../src/types';
import { ParsedPackageJson } from '../../src/detector/packageJsonParser';
import {
  detectPackageManager,
  detectNodeVersion,
  getInstallCommand,
  getCacheKey,
} from '../../src/detector/packageManagerDetector';
import { DetectionError } from '../../src/utils/errors';

function createMockPkg(overrides: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  engines?: { node?: string };
}): ParsedPackageJson {
  const deps = overrides.dependencies ?? {};
  const devDeps = overrides.devDependencies ?? {};
  const scripts = overrides.scripts ?? {};
  return {
    name: 'test-project',
    version: '1.0.0',
    dependencies: deps,
    devDependencies: devDeps,
    scripts,
    engines: overrides.engines,
    hasField(field: string): boolean {
      return (
        Object.prototype.hasOwnProperty.call(deps, field) ||
        Object.prototype.hasOwnProperty.call(devDeps, field)
      );
    },
    getDependencyVersion(name: string): string | null {
      if (Object.prototype.hasOwnProperty.call(deps, name)) return deps[name]!;
      if (Object.prototype.hasOwnProperty.call(devDeps, name)) return devDeps[name]!;
      return null;
    },
    hasScript(name: string): boolean {
      return Object.prototype.hasOwnProperty.call(scripts, name);
    },
  };
}

describe('packageManagerDetector', () => {
  let tmpDir: string;
  let devFS: DevForgeFS;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-test-pm-'));
    devFS = new DevForgeFS(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── detectPackageManager Tests ─────────────────────────────────────
  describe('detectPackageManager', () => {
    it('detects PNPM when pnpm-lock.yaml exists', async () => {
      await fs.writeFile(path.join(tmpDir, 'pnpm-lock.yaml'), '', 'utf-8');
      const pm = await detectPackageManager(devFS);
      expect(pm).toBe(PackageManager.PNPM);
    });

    it('detects YARN when yarn.lock exists', async () => {
      await fs.writeFile(path.join(tmpDir, 'yarn.lock'), '', 'utf-8');
      const pm = await detectPackageManager(devFS);
      expect(pm).toBe(PackageManager.YARN);
    });

    it('detects NPM when package-lock.json exists', async () => {
      await fs.writeFile(path.join(tmpDir, 'package-lock.json'), '', 'utf-8');
      const pm = await detectPackageManager(devFS);
      expect(pm).toBe(PackageManager.NPM);
    });

    it('falls back to NPM when no lock files are present', async () => {
      const pm = await detectPackageManager(devFS);
      expect(pm).toBe(PackageManager.NPM);
    });

    it('respects priority pnpm-lock.yaml > yarn.lock', async () => {
      await fs.writeFile(path.join(tmpDir, 'pnpm-lock.yaml'), '', 'utf-8');
      await fs.writeFile(path.join(tmpDir, 'yarn.lock'), '', 'utf-8');
      const pm = await detectPackageManager(devFS);
      expect(pm).toBe(PackageManager.PNPM);
    });

    it('respects priority yarn.lock > package-lock.json', async () => {
      await fs.writeFile(path.join(tmpDir, 'yarn.lock'), '', 'utf-8');
      await fs.writeFile(path.join(tmpDir, 'package-lock.json'), '', 'utf-8');
      const pm = await detectPackageManager(devFS);
      expect(pm).toBe(PackageManager.YARN);
    });
  });

  // ── detectNodeVersion Tests ────────────────────────────────────────
  describe('detectNodeVersion', () => {
    it('defaults to 20 when .nvmrc and engines.node are missing', async () => {
      const pkg = createMockPkg({});
      const version = await detectNodeVersion(devFS, pkg);
      expect(version).toBe('20');
    });

    it('reads and cleans version from .nvmrc (v prefix)', async () => {
      await fs.writeFile(path.join(tmpDir, '.nvmrc'), 'v18.16.0\n', 'utf-8');
      const pkg = createMockPkg({});
      const version = await detectNodeVersion(devFS, pkg);
      expect(version).toBe('18');
    });

    it('reads and cleans version from .nvmrc (no v prefix)', async () => {
      await fs.writeFile(path.join(tmpDir, '.nvmrc'), ' 16.0.0 \n', 'utf-8');
      const pkg = createMockPkg({});
      const version = await detectNodeVersion(devFS, pkg);
      expect(version).toBe('16');
    });

    it('reads and cleans version from .nvmrc (just major number)', async () => {
      await fs.writeFile(path.join(tmpDir, '.nvmrc'), '14', 'utf-8');
      const pkg = createMockPkg({});
      const version = await detectNodeVersion(devFS, pkg);
      expect(version).toBe('14');
    });

    it('extracts semver major version from engines.node', async () => {
      const pkg = createMockPkg({ engines: { node: '>=18.0.0' } });
      const version = await detectNodeVersion(devFS, pkg);
      expect(version).toBe('18');
    });

    it('extracts semver major version from complex engines.node range', async () => {
      const pkg = createMockPkg({ engines: { node: '^16.13.0' } });
      const version = await detectNodeVersion(devFS, pkg);
      expect(version).toBe('16');
    });

    it('prioritizes .nvmrc over engines.node', async () => {
      await fs.writeFile(path.join(tmpDir, '.nvmrc'), 'v16', 'utf-8');
      const pkg = createMockPkg({ engines: { node: '>=18.0.0' } });
      const version = await detectNodeVersion(devFS, pkg);
      expect(version).toBe('16');
    });

    it('throws DetectionError for version below 14', async () => {
      const pkg = createMockPkg({ engines: { node: '>=12.0.0' } });
      await expect(detectNodeVersion(devFS, pkg)).rejects.toThrow(DetectionError);
    });

    it('throws DetectionError for version above 24', async () => {
      const pkg = createMockPkg({ engines: { node: '25' } });
      await expect(detectNodeVersion(devFS, pkg)).rejects.toThrow(DetectionError);
    });

    it('throws DetectionError for non-numeric/invalid version', async () => {
      const pkg = createMockPkg({ engines: { node: 'invalid' } });
      await expect(detectNodeVersion(devFS, pkg)).rejects.toThrow(DetectionError);
    });

    it('throws DetectionError if reading .nvmrc fails due to non-existent folder or other error', async () => {
      // We can force DevForgeFS to throw a ValidationError or PathTraversalError,
      // but let's test if .nvmrc is a directory instead of a file which causes fs.readFile to fail
      await fs.mkdir(path.join(tmpDir, '.nvmrc'));
      const pkg = createMockPkg({});
      await expect(detectNodeVersion(devFS, pkg)).rejects.toThrow(DetectionError);
    });
  });

  // ── getInstallCommand Tests ────────────────────────────────────────
  describe('getInstallCommand', () => {
    it('returns npm ci for NPM', () => {
      expect(getInstallCommand(PackageManager.NPM)).toBe('npm ci');
    });

    it('returns yarn install --frozen-lockfile for YARN', () => {
      expect(getInstallCommand(PackageManager.YARN)).toBe('yarn install --frozen-lockfile');
    });

    it('returns pnpm install --frozen-lockfile for PNPM', () => {
      expect(getInstallCommand(PackageManager.PNPM)).toBe('pnpm install --frozen-lockfile');
    });
  });

  // ── getCacheKey Tests ──────────────────────────────────────────────
  describe('getCacheKey', () => {
    it('returns config for NPM', () => {
      const cache = getCacheKey(PackageManager.NPM);
      expect(cache.path).toBe('~/.npm');
      expect(cache.key).toContain('npm-');
      expect(cache.key).toContain("hashFiles('package-lock.json')");
    });

    it('returns config for YARN', () => {
      const cache = getCacheKey(PackageManager.YARN);
      expect(cache.path).toBe('~/.yarn/cache');
      expect(cache.key).toContain('yarn-');
      expect(cache.key).toContain("hashFiles('yarn.lock')");
    });

    it('returns config for PNPM', () => {
      const cache = getCacheKey(PackageManager.PNPM);
      expect(cache.path).toBe('~/.pnpm-store');
      expect(cache.key).toContain('pnpm-');
      expect(cache.key).toContain("hashFiles('pnpm-lock.yaml')");
    });
  });
});
