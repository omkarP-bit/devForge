import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { AgentCache } from '../../src/agent/cache/AgentCache';
import { CredentialManager } from '../../src/agent/credentials/CredentialManager';
import { maskCredential } from '../../src/agent/providerDisplay';
import { agentResetCommand, agentStatusCommand } from '../../src/cli/agentCommand';

const execAsync = promisify(exec);

describe('agent CLI commands', () => {
  const cliPath = path.resolve(__dirname, '../../dist/cli/index.js');
  let tempDir: string;
  let credentialsPath: string;
  let cachePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-agent-cli-'));
    credentialsPath = path.join(tempDir, 'credentials.json');
    cachePath = path.join(tempDir, 'agent-cache.json');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('maskCredential', () => {
    it('masks values after the first four characters', () => {
      expect(maskCredential('sk-live-secret-key')).toBe('sk-l***');
      expect(maskCredential('abc')).toBe('abc***');
    });
  });

  describe('agentStatusCommand', () => {
    it('prints the active provider name and masked credentials', async () => {
      const credentialManager = new CredentialManager({ credentialsPath });
      await credentialManager.saveCredentials({
        provider: 'nova-pro',
        credentials: {
          AWS_ACCESS_KEY_ID: 'AKIA123456',
          AWS_SECRET_ACCESS_KEY: 'super-secret',
        },
        setupAt: '2026-01-01T00:00:00.000Z',
        version: 1,
      });

      const cache = new AgentCache({ cachePath });
      await cache.set('sample-key', 'sample-response');

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await agentStatusCommand({ credentialManager, cache });

      const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(output).toContain('Amazon Nova Pro');
      expect(output).toContain('AKIA***');
      expect(output).toContain('Local cache entries: 1');
      expect(output).toContain('2026-01-01T00:00:00.000Z');

      logSpy.mockRestore();
    });
  });

  describe('agentResetCommand', () => {
    it('clears the credential file before re-running setup', async () => {
      const credentialManager = new CredentialManager({ credentialsPath });
      await credentialManager.saveOfflineCredentials();

      const clearSpy = jest.spyOn(credentialManager, 'clearCredentials');
      const setupSpy = jest
        .spyOn(credentialManager, 'saveOfflineCredentials')
        .mockResolvedValue({
          provider: 'offline',
          credentials: {},
          setupAt: new Date().toISOString(),
          version: 1,
        });

      const originalCi = process.env.CI;
      process.env.CI = 'true';

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await agentResetCommand({ credentialManager });

      expect(clearSpy).toHaveBeenCalled();
      expect(setupSpy).toHaveBeenCalled();

      logSpy.mockRestore();
      process.env.CI = originalCi;
    });
  });

  describe('CLI integration', () => {
    it(
      'agent status prints provider name',
      async () => {
      const credentialManager = new CredentialManager({ credentialsPath });
      await credentialManager.saveCredentials({
        provider: 'gemini',
        credentials: { GEMINI_API_KEY: 'gemini-test-key' },
        setupAt: new Date().toISOString(),
        version: 1,
      });

      const { stdout, stderr } = await execAsync(`node "${cliPath}" agent status`, {
        env: {
          ...process.env,
          DEVFORGE_CREDENTIALS_PATH: credentialsPath,
          DEVFORGE_AGENT_CACHE_PATH: cachePath,
        },
      } as any);

      expect(stderr).not.toMatch(/error/i);
      expect(stdout).toContain('Google Gemini');
      expect(stdout).toContain('gemi***');
    },
      30_000,
    );

    it(
      'agent reset clears the credential file and re-saves in CI mode',
      async () => {
      const credentialManager = new CredentialManager({ credentialsPath });
      await credentialManager.saveCredentials({
        provider: 'openai',
        credentials: { OPENAI_API_KEY: 'openai-key' },
        setupAt: '2026-01-01T00:00:00.000Z',
        version: 1,
      });

      const beforeReset = await fs.readFile(credentialsPath, 'utf-8');

      const { stderr } = await execAsync(`node "${cliPath}" agent reset`, {
        env: {
          ...process.env,
          CI: 'true',
          DEVFORGE_CREDENTIALS_PATH: credentialsPath,
        },
      } as any);

      expect(stderr).not.toMatch(/error/i);
      await expect(fs.access(credentialsPath)).resolves.not.toThrow();

      const afterReset = await fs.readFile(credentialsPath, 'utf-8');
      expect(afterReset).not.toEqual(beforeReset);
      expect(JSON.parse(afterReset).provider).toBe('offline');
    },
      30_000,
    );

    it('--no-agent suppresses agent output during init', async () => {
      const { stdout: agentStdout } = await execAsync(
        `node "${cliPath}" init --dry-run --no-agent`,
        {
          env: {
            ...process.env,
            CI: 'true',
            DEVFORGE_CREDENTIALS_PATH: credentialsPath,
          },
        } as any,
      );

      expect(agentStdout).toContain('Automated CI/CD Pipeline Generator');
      expect(agentStdout).not.toContain('Agentic Edition');
      expect(agentStdout).not.toContain('AI Provider:');
    });

    it('init without --no-agent shows the agentic banner', async () => {
      const credentialManager = new CredentialManager({ credentialsPath });
      await credentialManager.saveOfflineCredentials();

      const { stdout } = await execAsync(`node "${cliPath}" init --dry-run`, {
        env: {
          ...process.env,
          CI: 'true',
          DEVFORGE_CREDENTIALS_PATH: credentialsPath,
        },
      } as any);

      expect(stdout).toContain('Agentic Edition');
      expect(stdout).toContain('AI Provider:');
      expect(stdout).toContain('Offline');
    });
  });
});
