import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { DevForgeFS } from '../../src/utils';
import { Framework, PackageManager, DetectedProject } from '../../src/types';
import {
  saveDetectionCache,
  loadDetectionCache,
  isCacheValid,
} from '../../src/detector/detectionCache';

describe('detectionCache', () => {
  let tmpDir: string;
  let devFS: DevForgeFS;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-test-cache-'));
    devFS = new DevForgeFS(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const sampleProject: DetectedProject = {
    framework: Framework.NEXTJS,
    packageManager: PackageManager.YARN,
    nodeVersion: '18',
    hasDocker: true,
    hasTests: true,
    hasLinting: true,
    testCommand: 'jest',
    buildCommand: 'next build',
    installCommand: 'yarn install --frozen-lockfile',
    detectedAt: new Date().toISOString(),
  };

  describe('saveDetectionCache & loadDetectionCache', () => {
    it('saves detection result and loads it back successfully', async () => {
      await saveDetectionCache(devFS, sampleProject);

      // Verify directory and file exist
      const cacheFilePath = path.join(tmpDir, '.devforge', 'detection.json');
      await expect(fs.access(cacheFilePath)).resolves.not.toThrow();

      const loaded = await loadDetectionCache(devFS);
      expect(loaded).toEqual(sampleProject);
    });

    it('returns null if the cache file does not exist', async () => {
      const loaded = await loadDetectionCache(devFS);
      expect(loaded).toBeNull();
    });

    it('returns null if the cache file contains invalid JSON', async () => {
      await devFS.ensureDir('.devforge');
      await devFS.writeFile('.devforge/detection.json', '{ bad json: ');
      const loaded = await loadDetectionCache(devFS);
      expect(loaded).toBeNull();
    });

    it('returns null if the cache data fails Zod validation', async () => {
      const corruptProject = {
        ...sampleProject,
        framework: 'invalid-framework', // Fails framework enum validation
      };
      await saveDetectionCache(devFS, corruptProject as any);
      const loaded = await loadDetectionCache(devFS);
      expect(loaded).toBeNull();
    });

    it('returns null if the cached timestamp is older than 24 hours', async () => {
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25 hours ago
      const oldProject = {
        ...sampleProject,
        detectedAt: oldTime,
      };
      await saveDetectionCache(devFS, oldProject);
      const loaded = await loadDetectionCache(devFS);
      expect(loaded).toBeNull();
    });
  });

  describe('isCacheValid', () => {
    it('returns true for a recent timestamp (e.g. now)', () => {
      expect(isCacheValid(sampleProject)).toBe(true);
    });

    it('returns true for 12 hours ago', () => {
      const time = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      expect(isCacheValid({ ...sampleProject, detectedAt: time })).toBe(true);
    });

    it('returns false for exactly 24 hours ago', () => {
      const time = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      expect(isCacheValid({ ...sampleProject, detectedAt: time })).toBe(false);
    });

    it('returns false for 48 hours ago', () => {
      const time = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      expect(isCacheValid({ ...sampleProject, detectedAt: time })).toBe(false);
    });

    it('returns false for an invalid timestamp', () => {
      expect(isCacheValid({ ...sampleProject, detectedAt: 'invalid-date' })).toBe(false);
    });
  });
});
