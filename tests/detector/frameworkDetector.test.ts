import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { DevForgeFS } from '../../src/utils';
import { Framework, PackageManager } from '../../src/types';
import { ParsedPackageJson } from '../../src/detector/packageJsonParser';
import {
  detectFramework,
  detectProjectMeta,
} from '../../src/detector/frameworkDetector';

// ── Helper to build a mock ParsedPackageJson ─────────────────────────

function createMockPkg(overrides: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
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
    hasField(field: string): boolean {
      return (
        Object.prototype.hasOwnProperty.call(deps, field) ||
        Object.prototype.hasOwnProperty.call(devDeps, field)
      );
    },
    getDependencyVersion(name: string): string | null {
      if (Object.prototype.hasOwnProperty.call(deps, name)) return deps[name]!;
      if (Object.prototype.hasOwnProperty.call(devDeps, name))
        return devDeps[name]!;
      return null;
    },
    hasScript(name: string): boolean {
      return Object.prototype.hasOwnProperty.call(scripts, name);
    },
  };
}

let tmpDir: string;
let devFS: DevForgeFS;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-test-fw-'));
  devFS = new DevForgeFS(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── Framework Detection Tests ────────────────────────────────────────

describe('detectFramework', () => {
  it('detects NestJS when @nestjs/core and @nestjs/common are present', async () => {
    const pkg = createMockPkg({
      dependencies: { '@nestjs/core': '^10.0.0', '@nestjs/common': '^10.0.0' },
    });
    expect(await detectFramework(pkg, devFS)).toBe(Framework.NESTJS);
  });

  it('detects Next.js when next and react are present', async () => {
    const pkg = createMockPkg({
      dependencies: { next: '^14.0.0', react: '^18.0.0' },
    });
    expect(await detectFramework(pkg, devFS)).toBe(Framework.NEXTJS);
  });

  it('detects Angular when @angular/core is present', async () => {
    const pkg = createMockPkg({
      dependencies: { '@angular/core': '^17.0.0' },
    });
    expect(await detectFramework(pkg, devFS)).toBe(Framework.ANGULAR);
  });

  it('detects MERN when mongoose, express, and react are present', async () => {
    const pkg = createMockPkg({
      dependencies: {
        mongoose: '^7.0.0',
        express: '^4.18.0',
        react: '^18.0.0',
      },
    });
    expect(await detectFramework(pkg, devFS)).toBe(Framework.MERN);
  });

  it('detects Vue when vue is present', async () => {
    const pkg = createMockPkg({
      dependencies: { vue: '^3.3.0' },
    });
    expect(await detectFramework(pkg, devFS)).toBe(Framework.VUE);
  });

  it('detects React when react is present but NOT next', async () => {
    const pkg = createMockPkg({
      dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
    });
    expect(await detectFramework(pkg, devFS)).toBe(Framework.REACT);
  });

  it('detects Express when express is present but NOT mongoose', async () => {
    const pkg = createMockPkg({
      dependencies: { express: '^4.18.0' },
    });
    expect(await detectFramework(pkg, devFS)).toBe(Framework.EXPRESS);
  });

  it('returns UNKNOWN when no framework dependencies are present', async () => {
    const pkg = createMockPkg({
      dependencies: { lodash: '^4.17.0' },
    });
    expect(await detectFramework(pkg, devFS)).toBe(Framework.UNKNOWN);
  });

  // ── Edge Cases ──

  it('resolves Next.js over React when both next and react are present', async () => {
    const pkg = createMockPkg({
      dependencies: { next: '^14.0.0', react: '^18.0.0', 'react-dom': '^18.0.0' },
    });
    // Next.js confidence 90 > React confidence 80
    expect(await detectFramework(pkg, devFS)).toBe(Framework.NEXTJS);
  });

  it('resolves NestJS over Express when both are present', async () => {
    const pkg = createMockPkg({
      dependencies: {
        '@nestjs/core': '^10.0.0',
        '@nestjs/common': '^10.0.0',
        express: '^4.18.0',
      },
    });
    // NestJS confidence 95 > Express confidence 75
    expect(await detectFramework(pkg, devFS)).toBe(Framework.NESTJS);
  });

  it('resolves MERN over Express when mongoose+express+react are present', async () => {
    const pkg = createMockPkg({
      dependencies: {
        mongoose: '^7.0.0',
        express: '^4.18.0',
        react: '^18.0.0',
      },
    });
    // MERN confidence 85 > Express confidence 75 (Express also excluded by mongoose check)
    expect(await detectFramework(pkg, devFS)).toBe(Framework.MERN);
  });

  it('detects from devDependencies as well', async () => {
    const pkg = createMockPkg({
      devDependencies: { vue: '^3.3.0' },
    });
    expect(await detectFramework(pkg, devFS)).toBe(Framework.VUE);
  });
});

// ── Project Metadata Detection Tests ─────────────────────────────────

describe('detectProjectMeta', () => {
  it('detects Docker when Dockerfile exists', async () => {
    await fs.writeFile(path.join(tmpDir, 'Dockerfile'), 'FROM node:20', 'utf-8');
    const pkg = createMockPkg({});
    const meta = await detectProjectMeta(pkg, devFS, PackageManager.NPM);
    expect(meta.hasDocker).toBe(true);
  });

  it('detects Docker when docker-compose.yml exists', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'docker-compose.yml'),
      'version: "3.8"',
      'utf-8',
    );
    const pkg = createMockPkg({});
    const meta = await detectProjectMeta(pkg, devFS, PackageManager.NPM);
    expect(meta.hasDocker).toBe(true);
  });

  it('reports no Docker when neither Dockerfile nor docker-compose.yml exists', async () => {
    const pkg = createMockPkg({});
    const meta = await detectProjectMeta(pkg, devFS, PackageManager.NPM);
    expect(meta.hasDocker).toBe(false);
  });

  it('detects tests via scripts.test', async () => {
    const pkg = createMockPkg({ scripts: { test: 'jest' } });
    const meta = await detectProjectMeta(pkg, devFS, PackageManager.NPM);
    expect(meta.hasTests).toBe(true);
    expect(meta.testCommand).toBe('jest');
  });

  it('detects tests via jest devDependency', async () => {
    const pkg = createMockPkg({ devDependencies: { jest: '^29.0.0' } });
    const meta = await detectProjectMeta(pkg, devFS, PackageManager.NPM);
    expect(meta.hasTests).toBe(true);
  });

  it('detects tests via vitest devDependency', async () => {
    const pkg = createMockPkg({ devDependencies: { vitest: '^1.0.0' } });
    const meta = await detectProjectMeta(pkg, devFS, PackageManager.NPM);
    expect(meta.hasTests).toBe(true);
  });

  it('detects tests via mocha devDependency', async () => {
    const pkg = createMockPkg({ devDependencies: { mocha: '^10.0.0' } });
    const meta = await detectProjectMeta(pkg, devFS, PackageManager.NPM);
    expect(meta.hasTests).toBe(true);
  });

  it('reports no tests when absent', async () => {
    const pkg = createMockPkg({});
    const meta = await detectProjectMeta(pkg, devFS, PackageManager.NPM);
    expect(meta.hasTests).toBe(false);
    expect(meta.testCommand).toBeNull();
  });

  it('detects linting via eslint', async () => {
    const pkg = createMockPkg({ devDependencies: { eslint: '^8.0.0' } });
    const meta = await detectProjectMeta(pkg, devFS, PackageManager.NPM);
    expect(meta.hasLinting).toBe(true);
  });

  it('detects linting via tslint', async () => {
    const pkg = createMockPkg({ devDependencies: { tslint: '^6.0.0' } });
    const meta = await detectProjectMeta(pkg, devFS, PackageManager.NPM);
    expect(meta.hasLinting).toBe(true);
  });

  it('detects linting via biome', async () => {
    const pkg = createMockPkg({ devDependencies: { biome: '^1.0.0' } });
    const meta = await detectProjectMeta(pkg, devFS, PackageManager.NPM);
    expect(meta.hasLinting).toBe(true);
  });

  it('reports no linting when absent', async () => {
    const pkg = createMockPkg({});
    const meta = await detectProjectMeta(pkg, devFS, PackageManager.NPM);
    expect(meta.hasLinting).toBe(false);
  });

  it('extracts buildCommand from scripts', async () => {
    const pkg = createMockPkg({ scripts: { build: 'tsc' } });
    const meta = await detectProjectMeta(pkg, devFS, PackageManager.NPM);
    expect(meta.buildCommand).toBe('tsc');
  });

  it('returns null buildCommand when absent', async () => {
    const pkg = createMockPkg({});
    const meta = await detectProjectMeta(pkg, devFS, PackageManager.NPM);
    expect(meta.buildCommand).toBeNull();
  });

  it('derives install command for npm', async () => {
    const pkg = createMockPkg({});
    const meta = await detectProjectMeta(pkg, devFS, PackageManager.NPM);
    expect(meta.installCommand).toBe('npm ci');
  });

  it('derives install command for yarn', async () => {
    const pkg = createMockPkg({});
    const meta = await detectProjectMeta(pkg, devFS, PackageManager.YARN);
    expect(meta.installCommand).toBe('yarn install --frozen-lockfile');
  });

  it('derives install command for pnpm', async () => {
    const pkg = createMockPkg({});
    const meta = await detectProjectMeta(pkg, devFS, PackageManager.PNPM);
    expect(meta.installCommand).toBe('pnpm install --frozen-lockfile');
  });
});
