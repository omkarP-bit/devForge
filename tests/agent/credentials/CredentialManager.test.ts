import { randomBytes } from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import inquirer from 'inquirer';
import { CREDENTIALS_VERSION, CredentialManager } from '../../../src/agent/credentials';
import { resolveProvider } from '../../../src/agent/providers/ProviderFactory';

jest.mock('inquirer');
jest.mock('../../../src/agent/providers/ProviderFactory');
jest.mock('../../../src/agent/cache/testElastiCache', () => ({
  testElastiCacheConnection: jest.fn(),
}));

const mockedInquirer = inquirer as jest.Mocked<typeof inquirer>;
const mockedResolveProvider = resolveProvider as jest.MockedFunction<typeof resolveProvider>;
const { testElastiCacheConnection } = jest.requireMock(
  '../../../src/agent/cache/testElastiCache',
) as { testElastiCacheConnection: jest.Mock };

describe('CredentialManager', () => {
  let tempDir: string;
  let credentialsPath: string;
  let key: Buffer;
  let manager: CredentialManager;

  beforeEach(async () => {
    jest.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-credentials-'));
    credentialsPath = path.join(tempDir, 'credentials.json');
    key = randomBytes(32);
    manager = new CredentialManager({
      credentialsPath,
      deriveKey: () => key,
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('tryLoadCredentials() returns null when credentials are missing', async () => {
    await expect(manager.tryLoadCredentials()).resolves.toBeNull();
  });

  it('clearCredentials() removes the credentials file', async () => {
    await manager.saveOfflineCredentials();
    await manager.clearCredentials();
    await expect(fs.access(credentialsPath)).rejects.toThrow();
  });

  it('isFirstRun() returns true when credentials file does not exist', async () => {
    await expect(manager.isFirstRun()).resolves.toBe(true);
  });

  it('isFirstRun() returns false when credentials file is valid', async () => {
    await manager.saveOfflineCredentials();
    await expect(manager.isFirstRun()).resolves.toBe(false);
  });

  it('isFirstRun() returns true when decryption fails', async () => {
    await manager.saveOfflineCredentials();
    const otherKeyManager = new CredentialManager({
      credentialsPath,
      deriveKey: () => randomBytes(32),
    });

    await expect(otherKeyManager.isFirstRun()).resolves.toBe(true);
  });

  it('saveOfflineCredentials() stores offline provider config', async () => {
    const stored = await manager.saveOfflineCredentials();
    expect(stored.provider).toBe('offline');
    expect(stored.credentials).toEqual({});
    expect(stored.version).toBe(1);

    const loaded = await manager.loadCredentials();
    expect(loaded.provider).toBe('offline');
  });

  it('runFirstTimeSetup() stores Gemini credentials after prompts', async () => {
    mockedInquirer.prompt
      .mockResolvedValueOnce({ provider: 'gemini' })
      .mockResolvedValueOnce({ GEMINI_API_KEY: 'gemini-secret' })
      .mockResolvedValueOnce({ cacheMode: 'local' })
      .mockResolvedValueOnce({ testConnection: false });

    const stored = await manager.runFirstTimeSetup();

    expect(stored.provider).toBe('gemini');
    expect(stored.credentials.GEMINI_API_KEY).toBe('gemini-secret');

    const raw = await fs.readFile(credentialsPath, 'utf-8');
    expect(raw).not.toContain('gemini-secret');
  });

  it('runFirstTimeSetup() tests provider availability when requested', async () => {
    const mockIsAvailable = jest.fn().mockResolvedValue(true);
    mockedResolveProvider.mockReturnValue({
      name: 'openai',
      chat: jest.fn(),
      isAvailable: mockIsAvailable,
    });
    mockedInquirer.prompt
      .mockResolvedValueOnce({ provider: 'openai' })
      .mockResolvedValueOnce({ OPENAI_API_KEY: 'openai-secret' })
      .mockResolvedValueOnce({ cacheMode: 'local' })
      .mockResolvedValueOnce({ testConnection: true });

    await manager.runFirstTimeSetup();

    expect(mockedResolveProvider).toHaveBeenCalledWith({
      provider: 'openai',
      credentials: { OPENAI_API_KEY: 'openai-secret', ELASTICACHE_ENABLED: 'false' },
    });
    expect(mockIsAvailable).toHaveBeenCalled();
  });

  it('runFirstTimeSetup() skips credential prompts for offline mode', async () => {
    mockedInquirer.prompt.mockResolvedValueOnce({ provider: 'offline' });

    const stored = await manager.runFirstTimeSetup();

    expect(stored.provider).toBe('offline');
    expect(mockedInquirer.prompt).toHaveBeenCalledTimes(1);
  });

  it('loadCredentials() re-runs setup when decryption fails in interactive mode', async () => {
    await manager.saveOfflineCredentials();

    const reconfigureManager = new CredentialManager({
      credentialsPath,
      deriveKey: () => randomBytes(32),
    });

    mockedInquirer.prompt.mockResolvedValueOnce({ provider: 'offline' });

    const originalCi = process.env.CI;
    delete process.env.CI;

    const stored = await reconfigureManager.loadCredentials();
    expect(stored.provider).toBe('offline');
    expect(mockedInquirer.prompt).toHaveBeenCalled();

    if (originalCi === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = originalCi;
    }
  });

  it('loadCredentials() saves offline credentials in CI when decryption fails', async () => {
    await manager.saveOfflineCredentials();

    const reconfigureManager = new CredentialManager({
      credentialsPath,
      deriveKey: () => randomBytes(32),
    });

    const originalCi = process.env.CI;
    process.env.CI = 'true';

    const stored = await reconfigureManager.loadCredentials();
    expect(stored.provider).toBe('offline');
    expect(mockedInquirer.prompt).not.toHaveBeenCalled();

    process.env.CI = originalCi;
  });

  it('runFirstTimeSetup() stores Nova Pro AWS credentials after prompts', async () => {
    mockedInquirer.prompt
      .mockResolvedValueOnce({ provider: 'nova-pro' })
      .mockResolvedValueOnce({
        AWS_ACCESS_KEY_ID: 'access',
        AWS_SECRET_ACCESS_KEY: 'secret',
        AWS_REGION: 'us-west-2',
      })
      .mockResolvedValueOnce({ cacheMode: 'local' })
      .mockResolvedValueOnce({ testConnection: false });

    const stored = await manager.runFirstTimeSetup();

    expect(stored.provider).toBe('nova-pro');
    expect(stored.credentials.AWS_REGION).toBe('us-west-2');
    expect(stored.version).toBe(CREDENTIALS_VERSION);
  });

  it('runFirstTimeSetup() stores Bedrock credentials with model ID', async () => {
    mockedInquirer.prompt
      .mockResolvedValueOnce({ provider: 'bedrock' })
      .mockResolvedValueOnce({
        AWS_ACCESS_KEY_ID: 'access',
        AWS_SECRET_ACCESS_KEY: 'secret',
        AWS_REGION: 'us-east-1',
      })
      .mockResolvedValueOnce({ modelId: 'anthropic.claude-3-haiku-20240307-v1:0' })
      .mockResolvedValueOnce({ cacheMode: 'local' })
      .mockResolvedValueOnce({ testConnection: false });

    const stored = await manager.runFirstTimeSetup();

    expect(stored.provider).toBe('bedrock');
    expect(stored.credentials.BEDROCK_MODEL_ID).toBe(
      'anthropic.claude-3-haiku-20240307-v1:0',
    );
  });

  it('runFirstTimeSetup() reports failed connection tests without throwing', async () => {
    const mockIsAvailable = jest.fn().mockResolvedValue(false);
    mockedResolveProvider.mockReturnValue({
      name: 'anthropic',
      chat: jest.fn(),
      isAvailable: mockIsAvailable,
    });
    mockedInquirer.prompt
      .mockResolvedValueOnce({ provider: 'anthropic' })
      .mockResolvedValueOnce({ ANTHROPIC_API_KEY: 'anthropic-secret' })
      .mockResolvedValueOnce({ cacheMode: 'local' })
      .mockResolvedValueOnce({ testConnection: true });

    const stored = await manager.runFirstTimeSetup();
    expect(stored.provider).toBe('anthropic');
    expect(mockIsAvailable).toHaveBeenCalled();
  });

  it('isFirstRun() returns true when credentials file structure is invalid', async () => {
    await fs.writeFile(credentialsPath, JSON.stringify({ provider: 'offline' }), 'utf-8');
    await expect(manager.isFirstRun()).resolves.toBe(true);
  });

  it('runFirstTimeSetup() stores ElastiCache credentials when cloud cache is selected', async () => {
    testElastiCacheConnection.mockResolvedValue({
      success: true,
      configured: true,
      message: 'Connected to ElastiCache at cluster.cache.amazonaws.com:6379 (12ms)',
      latencyMs: 12,
    });

    mockedInquirer.prompt
      .mockResolvedValueOnce({ provider: 'openai' })
      .mockResolvedValueOnce({ OPENAI_API_KEY: 'openai-secret' })
      .mockResolvedValueOnce({ cacheMode: 'elasticache' })
      .mockResolvedValueOnce({
        ELASTICACHE_HOST: 'cluster.cache.amazonaws.com',
        ELASTICACHE_PORT: '6379',
        ELASTICACHE_AUTH_TOKEN: '',
        ELASTICACHE_TLS: true,
      })
      .mockResolvedValueOnce({ testNow: true })
      .mockResolvedValueOnce({ testConnection: false });

    const stored = await manager.runFirstTimeSetup();

    expect(stored.credentials.ELASTICACHE_ENABLED).toBe('true');
    expect(stored.credentials.ELASTICACHE_HOST).toBe('cluster.cache.amazonaws.com');
    expect(testElastiCacheConnection).toHaveBeenCalledWith({
      credentials: expect.objectContaining({
        ELASTICACHE_ENABLED: 'true',
        ELASTICACHE_HOST: 'cluster.cache.amazonaws.com',
      }),
    });
  });

  it('runFirstTimeSetup() stores local cache preference explicitly', async () => {
    mockedInquirer.prompt
      .mockResolvedValueOnce({ provider: 'openai' })
      .mockResolvedValueOnce({ OPENAI_API_KEY: 'openai-secret' })
      .mockResolvedValueOnce({ cacheMode: 'local' })
      .mockResolvedValueOnce({ testConnection: false });

    const stored = await manager.runFirstTimeSetup();
    expect(stored.credentials.ELASTICACHE_ENABLED).toBe('false');
  });

  it('sanitizes credential values with control characters during setup', async () => {
    mockedInquirer.prompt
      .mockResolvedValueOnce({ provider: 'openai' })
      .mockResolvedValueOnce({ OPENAI_API_KEY: 'bad\u0000key' })
      .mockResolvedValueOnce({ cacheMode: 'local' })
      .mockResolvedValueOnce({ testConnection: false });

    const stored = await manager.runFirstTimeSetup();
    expect(stored.credentials.OPENAI_API_KEY).toBe('badkey');
  });
});
