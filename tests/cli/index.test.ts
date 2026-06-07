import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { logger } from '../../src/utils/logger';

const execAsync = promisify(exec);

describe('CLI and Logger Smoke Tests', () => {
  const cliPath = path.resolve(__dirname, '../../dist/cli/index.js');

  it(
    'exits with code 0 when run with --help',
    async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-cli-help-'));
    const cachePath = path.join(tempDir, 'agent-cache.json');

    try {
    const { stdout, stderr } = await execAsync(`node "${cliPath}" --help`, {
      env: {
        ...process.env,
        DEVFORGE_AGENT_CACHE_PATH: cachePath,
      },
    } as any);
    expect(stderr).not.toMatch(/error/i);
    expect(stdout).toContain('Automated CI/CD Pipeline Generator');
    expect(stdout).toContain('Usage: devforge');
    expect(stdout).toContain('Agent Commands:');
    expect(stdout).toContain('agent status');
    expect(stdout).toContain('cache stats');
    expect(stdout).toContain('cache test-elasticache');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    },
    30_000,
  );

  it('warns about package integrity in production when launched outside node_modules', async () => {
    const { stderr } = await execAsync(`node "${cliPath}" --help`, {
      env: { ...process.env, NODE_ENV: 'production' },
    } as any);

    expect(stderr).toContain('Package integrity check');
  });

  it('exits with code 1 for unknown commands', async () => {
    let threw = false;
    try {
      await execAsync(`node "${cliPath}" invalidcommand`);
    } catch (err: any) {
      threw = true;
      expect(err.code).toBe(1);
      expect(err.stderr).toContain("error: unknown command 'invalidcommand'");
    }
    expect(threw).toBe(true);
  });

  it('logger does not write to stdout/stderr when NODE_ENV=test', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    logger.info('suppressed info');
    logger.success('suppressed success');
    logger.warn('suppressed warn');
    logger.error('suppressed error');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe('CLI direct module coverage', () => {
    let originalArgv: string[];

    beforeAll(() => {
      originalArgv = process.argv;
    });

    afterAll(() => {
      process.argv = originalArgv;
    });
    it('invokes the CLI binary for init (dry-run)', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-cli-init-'));
      const credentialsPath = path.join(tempDir, 'credentials.json');

      try {
        const { stdout, stderr } = await execAsync(`node "${cliPath}" init --dry-run`, {
          env: {
            ...process.env,
            CI: 'true',
            DEVFORGE_CREDENTIALS_PATH: credentialsPath,
          },
        } as any);
        expect(stderr).not.toMatch(/error/i);
        expect(stdout).toContain('Agentic Edition');
        expect(stdout).toContain('AI Provider:');
        await expect(fs.access(credentialsPath)).resolves.not.toThrow();
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('invokes the CLI binary for update (dry-run)', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-cli-update-'));
      let threw = false;
      try {
        await execAsync(`node "${cliPath}" update --dry-run`, {
          env: { ...process.env, CI: 'true' },
          cwd: tempDir,
        } as any);
      } catch (err: any) {
        threw = true;
        expect(err.code).toBe(1);
      }
      expect(threw).toBe(true);
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('invokes the CLI binary for audit (dry-run)', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-cli-audit-'));
      const { stdout, stderr } = await execAsync(`node "${cliPath}" audit`, {
        env: { ...process.env, CI: 'true' },
        cwd: tempDir,
      } as any);
      expect(stderr).not.toMatch(/error/i);
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('invokes the CLI binary for preview (dry-run)', async () => {
      const { stdout, stderr } = await execAsync(`node "${cliPath}" preview`, {
        env: { ...process.env, CI: 'true' },
      } as any);
      expect(stderr).not.toMatch(/error/i);
    });

    it('invokes the CLI binary for cache clear', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-cli-cache-'));
      const cachePath = path.join(tempDir, 'agent-cache.json');

      try {
        await fs.mkdir(tempDir, { recursive: true });
        await fs.writeFile(
          cachePath,
          JSON.stringify({
            entries: [
              {
                key: 'sample',
                response: 'value',
                createdAt: Date.now(),
                ttlMs: 86_400_000,
              },
            ],
          }),
          'utf-8',
        );

        const { stderr } = await execAsync(`node "${cliPath}" cache clear`, {
          env: {
            ...process.env,
            DEVFORGE_AGENT_CACHE_PATH: cachePath,
          },
        } as any);
        expect(stderr).not.toMatch(/error/i);

        const raw = JSON.parse(await fs.readFile(cachePath, 'utf-8')) as {
          entries: unknown[];
        };
        expect(raw.entries).toHaveLength(0);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });
  });
});
