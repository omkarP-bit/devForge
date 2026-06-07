import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';
import inquirer from 'inquirer';
import { AgentRuntime } from '../../src/agent/AgentRuntime';
import { RecommendationAgent } from '../../src/agent/agents';
import { AgentCache } from '../../src/agent/cache/AgentCache';
import { CredentialManager } from '../../src/agent/credentials';
import { resolveProvider } from '../../src/agent/providers/ProviderFactory';
import { RecommendationStore } from '../../src/agent/RecommendationStore';
import { initCommand } from '../../src/cli/initCommand';
import { BranchStrategy, DeploymentTarget, Framework, PackageManager } from '../../src/types';
import { DevForgeFS } from '../../src/utils/fs';
import { logger } from '../../src/utils/logger';
import { MockLLMProvider } from '../mocks/MockLLMProvider';

jest.mock('inquirer');
jest.mock('../../src/agent/providers/ProviderFactory');
jest.mock('ora', () => {
  const mockSpinner = {
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    warn: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
  };
  return jest.fn(() => mockSpinner);
});

const mockedInquirer = inquirer as jest.Mocked<typeof inquirer>;
const mockedResolveProvider = resolveProvider as jest.MockedFunction<typeof resolveProvider>;

const AgentResultSchema = z.object({
  agentName: z.string(),
  success: z.boolean(),
  messages: z.array(
    z.object({
      type: z.enum(['info', 'success', 'warn', 'error']),
      text: z.string(),
    }),
  ),
  expectedOutputs: z.array(z.string()),
  recommendations: z.array(
    z.object({
      type: z.enum(['update', 'security', 'optimization']),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      title: z.string(),
      description: z.string(),
      autoFixAvailable: z.boolean(),
    }),
  ),
  warnings: z.array(
    z.object({
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      title: z.string(),
      description: z.string(),
    }),
  ),
});

const FIXTURE_ROOT = path.resolve(__dirname, '../fixtures');
const HOME_DEVFORGE_DIR = path.join(os.homedir(), '.devforge');

let mockProvider: MockLLMProvider;
let configDir: string;
let projectDir: string;
let originalEnv: NodeJS.ProcessEnv;
let runForegroundSpy: jest.SpyInstance;
let consoleLogSpy: jest.SpyInstance;
let loggerInfoSpy: jest.SpyInstance;
let loggerSuccessSpy: jest.SpyInstance;

function applyConfigDir(dir: string): void {
  process.env.DEVFORGE_CONFIG_DIR = dir;
  process.env.DEVFORGE_CREDENTIALS_PATH = path.join(dir, 'credentials.json');
  process.env.DEVFORGE_AGENT_CACHE_PATH = path.join(dir, 'agent-cache.json');
}

async function cleanupConfigArtifacts(): Promise<void> {
  if (configDir) {
    await fs.rm(configDir, { recursive: true, force: true }).catch(() => undefined);
  }

  await fs.unlink(path.join(HOME_DEVFORGE_DIR, 'credentials.json')).catch(() => undefined);
  await fs.unlink(path.join(HOME_DEVFORGE_DIR, 'agent-cache.json')).catch(() => undefined);
}

async function copyFixture(fixtureName: string, targetDir: string): Promise<void> {
  const fixtureDir = path.join(FIXTURE_ROOT, fixtureName);
  await fs.mkdir(targetDir, { recursive: true });
  await fs.copyFile(path.join(fixtureDir, 'package.json'), path.join(targetDir, 'package.json'));
  await fs.writeFile(path.join(targetDir, 'package-lock.json'), '{}\n', 'utf-8');
}

async function seedOnlineCredentials(): Promise<void> {
  const manager = new CredentialManager({
    credentialsPath: process.env.DEVFORGE_CREDENTIALS_PATH!,
  });

  await manager.saveCredentials({
    provider: 'openai',
    credentials: { OPENAI_API_KEY: 'test-key' },
    setupAt: new Date().toISOString(),
    version: 1,
  });
}

function mockFirstRunPrompts(): void {
  mockedInquirer.prompt
    .mockResolvedValueOnce({ provider: 'openai' })
    .mockResolvedValueOnce({ OPENAI_API_KEY: 'test-key' })
    .mockResolvedValueOnce({ testConnection: false })
    .mockResolvedValueOnce({ deploymentTarget: 'vercel' })
    .mockResolvedValueOnce({ branchStrategy: 'feature_main' })
    .mockResolvedValueOnce({ dockerRequired: false })
    .mockResolvedValueOnce({ multiEnvironment: false })
    .mockResolvedValueOnce({ wantPreview: false });
}

function mockOverwritePrompts(): void {
  mockedInquirer.prompt.mockResolvedValue({ action: 'overwrite' });
}

async function getLatestAgentResult(): Promise<unknown> {
  const latestCall = runForegroundSpy.mock.results.at(-1);
  expect(latestCall).toBeDefined();
  return latestCall!.value;
}

async function assertGeneratedProjectFiles(): Promise<void> {
  await expect(fs.access(path.join(projectDir, '.github', 'workflows'))).resolves.not.toThrow();
  await expect(fs.access(path.join(projectDir, '.devforge', 'SECRETS_REQUIRED.md'))).resolves.not.toThrow();
  await expect(fs.access(path.join(projectDir, '.devforge', 'last-run.json'))).resolves.not.toThrow();
}

describe('agentic init flow E2E', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    originalEnv = { ...process.env };

    configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-e2e-config-'));
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-e2e-project-'));
    applyConfigDir(configDir);

    process.env.NODE_ENV = 'development';
    process.env.CI = 'false';

    mockProvider = MockLLMProvider.create();
    mockedResolveProvider.mockReturnValue(mockProvider);

    runForegroundSpy = jest.spyOn(AgentRuntime.prototype, 'runForeground');
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    loggerInfoSpy = jest.spyOn(logger, 'info');
    loggerSuccessSpy = jest.spyOn(logger, 'success');
  });

  afterEach(async () => {
    runForegroundSpy.mockRestore();
    consoleLogSpy.mockRestore();
    loggerInfoSpy.mockRestore();
    loggerSuccessSpy.mockRestore();

    process.env = originalEnv;
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => undefined);
    await cleanupConfigArtifacts();
  });

  it('T1: first run triggers setup, saves credentials, and runs the agent', async () => {
    await copyFixture('nextjs-vercel', projectDir);
    mockFirstRunPrompts();

    await expect(initCommand(projectDir)).resolves.toBeUndefined();

    await expect(fs.access(process.env.DEVFORGE_CREDENTIALS_PATH!)).resolves.not.toThrow();
    await assertGeneratedProjectFiles();

    expect(runForegroundSpy).toHaveBeenCalledTimes(1);
    const agentResult = await getLatestAgentResult();
    expect(() => AgentResultSchema.parse(agentResult)).not.toThrow();

    expect(loggerInfoSpy).toHaveBeenCalledWith('Running pipeline analysis...');
    expect(mockProvider.chat).toHaveBeenCalledTimes(1);

    const recommendationsPath = path.join(projectDir, '.devforge', 'recommendations.json');
    await expect(fs.access(recommendationsPath)).resolves.not.toThrow();
  });

  it('T2: second run loads credentials silently, runs the agent, and prints the report', async () => {
    await copyFixture('nextjs-vercel', projectDir);
    await seedOnlineCredentials();

    process.env.CI = 'true';
    mockOverwritePrompts();

    await initCommand(projectDir);
    expect(mockProvider.chat).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    mockedResolveProvider.mockReturnValue(mockProvider);
    runForegroundSpy.mockClear();
    consoleLogSpy.mockClear();
    loggerInfoSpy.mockClear();

    await initCommand(projectDir);

    await assertGeneratedProjectFiles();
    expect(runForegroundSpy).toHaveBeenCalledTimes(1);
    expect(mockProvider.chat).toHaveBeenCalledTimes(1);

    const output = consoleLogSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('What your pipeline will do');

    const agentResult = await getLatestAgentResult();
    expect(() => AgentResultSchema.parse(agentResult)).not.toThrow();
  });

  it('T3: --no-agent skips the agent and prints the v1 banner', async () => {
    await copyFixture('react-railway', projectDir);
    process.env.CI = 'true';

    await initCommand(projectDir, { noAgent: true });

    await assertGeneratedProjectFiles();
    expect(runForegroundSpy).not.toHaveBeenCalled();
    expect(mockProvider.chat).not.toHaveBeenCalled();

    const output = consoleLogSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('DevForge 1.0.0');
    expect(output).not.toContain('Agentic Edition');
    expect(loggerInfoSpy).not.toHaveBeenCalledWith('Running pipeline analysis...');
  });

  it('T4: unavailable provider falls back to static recommendation output', async () => {
    await copyFixture('express-docker', projectDir);
    await seedOnlineCredentials();
    process.env.CI = 'true';

    mockProvider = MockLLMProvider.create({ fail: true });
    mockedResolveProvider.mockReturnValue(mockProvider);

    await initCommand(projectDir);

    await assertGeneratedProjectFiles();
    expect(runForegroundSpy).toHaveBeenCalledTimes(1);
    expect(mockProvider.chat).not.toHaveBeenCalled();

    const agentResult = AgentResultSchema.parse(await getLatestAgentResult());
    expect(agentResult.recommendations.some((rec) => rec.title.includes('unavailable'))).toBe(
      true,
    );

    const output = consoleLogSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('What your pipeline will do');
  });

  it('T5: failure signals are passed to the agent and persisted recommendations include a fix', async () => {
    await copyFixture('nextjs-vercel', projectDir);
    await seedOnlineCredentials();
    process.env.CI = 'true';

    const packageJsonPath = path.join(projectDir, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    delete packageJson.scripts?.test;
    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8');

    const fixResponse = {
      recommendations: [
        {
          type: 'update' as const,
          severity: 'critical' as const,
          title: 'Add test script',
          description: 'Add an npm test script so the generated workflow can run tests.',
          autoFixAvailable: true,
        },
      ],
      expectedOutputs: ['Install dependencies via npm ci', 'Deploy to Vercel'],
    };
    mockProvider = MockLLMProvider.create({ response: fixResponse });
    mockedResolveProvider.mockReturnValue(mockProvider);

    await initCommand(projectDir);

    expect(mockProvider.chat).toHaveBeenCalledTimes(1);
    const messages = mockProvider.chat.mock.calls[0]?.[0] ?? [];
    const userMessage = [...messages].reverse().find((message) => message.role === 'user')?.content;
    expect(userMessage).toContain('Pipeline Failure');
    expect(userMessage).toContain('missing_script');

    const agentResult = AgentResultSchema.parse(await getLatestAgentResult());
    expect(agentResult.recommendations.some((rec) => rec.title === 'Add test script')).toBe(true);

    const stored = JSON.parse(
      await fs.readFile(path.join(projectDir, '.devforge', 'recommendations.json'), 'utf-8'),
    ) as { recommendations: Array<{ title: string }> };
    expect(stored.recommendations.some((rec) => rec.title === 'Add test script')).toBe(true);
  });

  it('T6: cache hit avoids a second provider.chat() call', async () => {
    await copyFixture('nextjs-vercel', projectDir);
    await seedOnlineCredentials();
    process.env.CI = 'true';
    await initCommand(projectDir);

    const credentials = await new CredentialManager({
      credentialsPath: process.env.DEVFORGE_CREDENTIALS_PATH!,
    }).loadCredentials();
    const cache = new AgentCache({ cachePath: process.env.DEVFORGE_AGENT_CACHE_PATH });
    const store = new RecommendationStore(new DevForgeFS(projectDir));
    mockProvider.chat.mockClear();

    const context = {
      config: {
        projectRoot: projectDir,
        detected: {
          framework: Framework.NEXTJS,
          packageManager: PackageManager.NPM,
          nodeVersion: '20',
          hasDocker: false,
          hasTests: true,
          hasLinting: true,
          testCommand: 'jest --ci',
          buildCommand: 'next build',
          installCommand: 'npm ci',
          detectedAt: new Date().toISOString(),
        },
        user: {
          deploymentTarget: DeploymentTarget.VERCEL,
          branchStrategy: BranchStrategy.FEATURE_MAIN,
          dockerRequired: false,
          multiEnvironment: false,
          environments: [],
        },
        dryRun: false,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '2.0.0',
      },
      generatedFiles: ['.github/workflows/base-ci.yml', '.github/workflows/deploy-vercel.yml'],
      lastRunJson: null,
      failureSignals: [],
    };

    const agent = new RecommendationAgent(mockProvider, credentials, cache, store);
    await agent.run(context);
    await agent.run(context);

    expect(mockProvider.chat).toHaveBeenCalledTimes(1);
  });
});
