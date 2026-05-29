import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { DevForgeFS } from '../../src/utils';
import { Framework, PackageManager } from '../../src/types';
import { runDetection } from '../../src/detector';
import { DetectionError } from '../../src/utils/errors';
import { logger } from '../../src/utils/logger';

// Mock ora so it does not pollute the test console output
jest.mock('ora', () => {
  const mockSpinner = {
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    text: '',
  };
  return jest.fn(() => mockSpinner);
});

describe('runDetection Orchestrator', () => {
  let tmpDir: string;
  let devFS: DevForgeFS;
  let consoleLogSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-test-orch-'));
    devFS = new DevForgeFS(tmpDir);

    // Suppress console.log and logger.warn to keep test logs clean
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    loggerWarnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    consoleLogSpy.mockRestore();
    loggerWarnSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('runs complete detection pipeline successfully for Next.js with yarn', async () => {
    const pkgContent = {
      name: 'next-project',
      version: '1.0.0',
      dependencies: {
        next: '^14.0.0',
        react: '^18.0.0',
      },
      devDependencies: {
        jest: '^29.0.0',
        eslint: '^8.0.0',
      },
      scripts: {
        build: 'next build',
        test: 'jest',
      },
      engines: {
        node: '>=18.0.0',
      },
    };

    // Set up file system structure
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkgContent), 'utf-8');
    await fs.writeFile(path.join(tmpDir, 'yarn.lock'), '', 'utf-8');
    await fs.writeFile(path.join(tmpDir, 'Dockerfile'), 'FROM node:18', 'utf-8');

    const result = await runDetection(devFS);

    // Verify properties
    expect(result.framework).toBe(Framework.NEXTJS);
    expect(result.packageManager).toBe(PackageManager.YARN);
    expect(result.nodeVersion).toBe('18');
    expect(result.hasDocker).toBe(true);
    expect(result.hasTests).toBe(true);
    expect(result.hasLinting).toBe(true);
    expect(result.testCommand).toBe('jest');
    expect(result.buildCommand).toBe('next build');
    expect(result.installCommand).toBe('yarn install --frozen-lockfile');
    expect(result.detectedAt).toBeDefined();
    expect(new Date(result.detectedAt).getTime()).not.toBeNaN();

    // Verify summary table is printed to console
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('proceeds with UNKNOWN framework and warns user when no framework matches', async () => {
    const pkgContent = {
      name: 'generic-project',
      version: '1.0.0',
    };

    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkgContent), 'utf-8');

    const result = await runDetection(devFS);

    expect(result.framework).toBe(Framework.UNKNOWN);
    expect(result.packageManager).toBe(PackageManager.NPM);
    expect(result.nodeVersion).toBe('20');
    expect(result.hasDocker).toBe(false);
    expect(result.hasTests).toBe(false);
    expect(result.hasLinting).toBe(false);
    expect(result.testCommand).toBeNull();
    expect(result.buildCommand).toBeNull();
    expect(result.installCommand).toBe('npm ci');

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Framework could not be auto-detected'),
    );
  });

  it('throws DetectionError if package.json is missing', async () => {
    await expect(runDetection(devFS)).rejects.toThrow(DetectionError);
  });

  it('throws DetectionError if package.json is invalid JSON', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), 'invalid-json', 'utf-8');
    await expect(runDetection(devFS)).rejects.toThrow(DetectionError);
  });

  describe('caching behaviors', () => {
    let loggerInfoSpy: jest.SpyInstance;

    beforeEach(() => {
      loggerInfoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    });

    afterEach(() => {
      loggerInfoSpy.mockRestore();
    });

    it('uses cache on subsequent runs if present and forceDetect is false', async () => {
      const pkgContent = { name: 'cached-project', version: '1.0.0' };
      await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkgContent), 'utf-8');

      // First run: cache miss, runs full detection, writes cache
      const freshResult = await runDetection(devFS);
      expect(loggerInfoSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Using cached detection'),
      );

      // Modify package.json contents on disk, but cache remains
      const modifiedPkg = { name: 'modified-project', version: '2.0.0' };
      await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(modifiedPkg), 'utf-8');

      // Second run: cache hit, returns original detection, logs using cached detection
      const cachedResult = await runDetection(devFS);
      expect(cachedResult).toEqual(freshResult);
      expect(loggerInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Using cached detection'),
      );
    });

    it('bypasses cache when forceDetect is true', async () => {
      const pkgContent1 = { name: 'project-1', version: '1.0.0' };
      await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkgContent1), 'utf-8');

      // First run
      const result1 = await runDetection(devFS);

      // Modify package.json
      const pkgContent2 = { name: 'project-2', version: '2.0.0' };
      await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkgContent2), 'utf-8');

      // Run with forceDetect: true
      const result2 = await runDetection(devFS, { forceDetect: true });
      expect(result2).not.toEqual(result1);
      expect(loggerInfoSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Using cached detection'),
      );
    });
  });
});
