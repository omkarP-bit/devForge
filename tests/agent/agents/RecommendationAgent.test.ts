import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  RecommendationAgent,
  buildExpectedOutputsFromConfig,
} from '../../../src/agent/agents/RecommendationAgent';
import { AgentCache } from '../../../src/agent/cache/AgentCache';
import { StoredCredentials } from '../../../src/agent/credentials/types';
import { AgentFallbackError } from '../../../src/agent/errors';
import { RecommendationStore } from '../../../src/agent/RecommendationStore';
import { AgentContext } from '../../../src/agent/types';
import { DevForgeFS } from '../../../src/utils/fs';
import { AgentMessage, LLMProvider } from '../../../src/agent/providers/types';
import { LastRunMetadata } from '../../../src/generator';
import {
  BranchStrategy,
  DeploymentTarget,
  DevForgeConfig,
  Framework,
  PackageManager,
} from '../../../src/types';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const onlineCredentials: StoredCredentials = {
  provider: 'openai',
  credentials: { OPENAI_API_KEY: 'test-key' },
  setupAt: new Date().toISOString(),
  version: 1,
};

const offlineCredentials: StoredCredentials = {
  provider: 'offline',
  credentials: {},
  setupAt: new Date().toISOString(),
  version: 1,
};

function buildDetected() {
  return {
    framework: Framework.NEXTJS,
    packageManager: PackageManager.NPM,
    nodeVersion: '20',
    hasDocker: false,
    hasTests: true,
    hasLinting: true,
    testCommand: 'npm test',
    buildCommand: 'npm run build',
    installCommand: 'npm ci',
    detectedAt: new Date().toISOString(),
  };
}

function buildUser() {
  return {
    deploymentTarget: DeploymentTarget.VERCEL,
    branchStrategy: BranchStrategy.FEATURE_MAIN,
    dockerRequired: false,
    multiEnvironment: false,
    environments: [],
  };
}

function createConfig(overrides?: Partial<DevForgeConfig>): DevForgeConfig {
  return {
    projectRoot: '/tmp/project',
    detected: buildDetected(),
    user: buildUser(),
    dryRun: false,
    generatedAt: new Date().toISOString(),
    devforgeVersion: '2.0.0',
    ...overrides,
  };
}

function createContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    config: createConfig(),
    generatedFiles: ['.github/workflows/ci.yml'],
    lastRunJson: null,
    failureSignals: [],
    ...overrides,
  };
}

function createProvider(chat: jest.Mock, isAvailable = true): LLMProvider {
  return {
    name: 'mock',
    chat,
    isAvailable: jest.fn().mockResolvedValue(isAvailable),
  };
}

function createLastRun(overrides?: Partial<LastRunMetadata>): LastRunMetadata {
  return {
    generationResult: {
      written: ['.github/workflows/ci.yml'],
      skipped: [],
      backed_up: [],
      errors: [],
    },
    planHash: 'abc123',
    timestamp: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function getLastUserMessage(chat: jest.Mock): string {
  const call = chat.mock.calls[0];
  if (!call) {
    throw new Error('chat was not called');
  }
  const messages = call[0] as AgentMessage[];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && message.role === 'user') {
      return message.content;
    }
  }
  throw new Error('no user message passed to chat');
}

describe('RecommendationAgent', () => {
  let tempDir: string;
  let cachePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-rec-agent-'));
    cachePath = path.join(tempDir, 'cache.json');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('run()', () => {
    it('parses recommendations and expected outputs from a JSON response', async () => {
      const chat = jest.fn().mockResolvedValue(
        JSON.stringify({
          recommendations: [
            {
              type: 'security',
              severity: 'critical',
              title: 'Pin actions',
              description: 'Pin GitHub Actions by SHA',
              autoFixAvailable: true,
            },
            {
              type: 'optimization',
              severity: 'low',
              title: 'Cache deps',
              description: 'Cache node_modules',
              autoFixAvailable: true,
            },
            {
              type: 'update',
              severity: 'medium',
              title: 'Bump Node',
              description: 'Node 18 EOL',
              autoFixAvailable: false,
            },
          ],
          expectedOutputs: ['Install deps', 'Run tests', 'Build', 'Deploy to Vercel'],
        }),
      );
      const provider = createProvider(chat);
      const cache = new AgentCache({ cachePath });
      const agent = new RecommendationAgent(provider, onlineCredentials, cache);

      const result = await agent.run(createContext());

      expect(result.agentName).toBe('RecommendationAgent');
      expect(result.success).toBe(true);
      expect(result.recommendations).toHaveLength(3);
      expect(result.recommendations[0]?.severity).toBe('critical');
      expect(result.recommendations[1]?.severity).toBe('medium');
      expect(result.recommendations[2]?.severity).toBe('low');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.title).toBe('Pin actions');
      expect(result.warnings[0]?.severity).toBe('critical');
      expect(result.messages.map((m) => m.text)).toEqual([
        'Install deps',
        'Run tests',
        'Build',
        'Deploy to Vercel',
      ]);
      expect(result.messages.every((m) => m.type === 'info')).toBe(true);
      expect(chat).toHaveBeenCalledTimes(1);
    });

    it('extracts JSON from a markdown code block', async () => {
      const chat = jest
        .fn()
        .mockResolvedValue(
          '```json\n{"recommendations":[],"expectedOutputs":["step 1","step 2"]}\n```',
        );
      const provider = createProvider(chat);
      const agent = new RecommendationAgent(provider, onlineCredentials, new AgentCache({ cachePath }));

      const result = await agent.run(createContext());

      expect(result.messages.map((m) => m.text)).toEqual(['step 1', 'step 2']);
      expect(result.recommendations).toEqual([]);
    });

    it('converts high and critical recommendations to warnings', async () => {
      const chat = jest.fn().mockResolvedValue(
        JSON.stringify({
          recommendations: [
            { type: 'security', severity: 'high', title: 'A', description: 'a', autoFixAvailable: false },
            { type: 'optimization', severity: 'medium', title: 'B', description: 'b', autoFixAvailable: false },
            { type: 'update', severity: 'critical', title: 'C', description: 'c', autoFixAvailable: true },
            { type: 'optimization', severity: 'low', title: 'D', description: 'd', autoFixAvailable: false },
          ],
          expectedOutputs: [],
        }),
      );
      const provider = createProvider(chat);
      const agent = new RecommendationAgent(provider, onlineCredentials, new AgentCache({ cachePath }));

      const result = await agent.run(createContext());

      expect(result.warnings).toHaveLength(2);
      const warningSeverities = result.warnings.map((w) => w.severity).sort();
      expect(warningSeverities).toEqual(['critical', 'high']);
      expect(result.recommendations).toHaveLength(4);
    });

    it('drops recommendations with invalid type or severity', async () => {
      const chat = jest.fn().mockResolvedValue(
        JSON.stringify({
          recommendations: [
            { type: 'security', severity: 'high', title: 'Valid', description: 'ok', autoFixAvailable: false },
            { type: 'unknown-type', severity: 'high', title: 'Bad type', description: 'x', autoFixAvailable: false },
            { type: 'optimization', severity: 'extreme', title: 'Bad sev', description: 'x', autoFixAvailable: false },
            { type: 'update', severity: 'low', title: '', description: 'empty title', autoFixAvailable: false },
            { type: 'update', severity: 'low', title: 'No desc' },
            { type: 'not-an-object' },
            null,
          ],
          expectedOutputs: [],
        }),
      );
      const provider = createProvider(chat);
      const agent = new RecommendationAgent(provider, onlineCredentials, new AgentCache({ cachePath }));

      const result = await agent.run(createContext());

      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0]?.title).toBe('Valid');
    });

    it('falls back to static expected outputs when the LLM response has none', async () => {
      const chat = jest.fn().mockResolvedValue('{"recommendations":[],"expectedOutputs":[]}');
      const provider = createProvider(chat);
      const agent = new RecommendationAgent(provider, onlineCredentials, new AgentCache({ cachePath }));
      const context = createContext({
        config: createConfig({
          detected: { ...buildDetected(), framework: Framework.NEXTJS },
          user: { ...buildUser(), deploymentTarget: DeploymentTarget.VERCEL },
        }),
      });

      const result = await agent.run(context);

      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages.every((m) => m.type === 'info')).toBe(true);
      expect(result.messages.some((m) => m.text.toLowerCase().includes('next'))).toBe(true);
      expect(result.messages.some((m) => m.text.toLowerCase().includes('vercel'))).toBe(true);
    });

    it('returns an empty result with fallback expected outputs when JSON is unparsable', async () => {
      const chat = jest.fn().mockResolvedValue('not-json-at-all');
      const provider = createProvider(chat);
      const agent = new RecommendationAgent(provider, onlineCredentials, new AgentCache({ cachePath }));

      const result = await agent.run(
        createContext({
          config: createConfig({
            detected: { ...buildDetected(), framework: Framework.REACT },
            user: { ...buildUser(), deploymentTarget: DeploymentTarget.RAILWAY },
          }),
        }),
      );

      expect(result.success).toBe(true);
      expect(result.recommendations).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.messages.some((m) => m.text.toLowerCase().includes('react'))).toBe(true);
      expect(result.messages.some((m) => m.text.toLowerCase().includes('railway'))).toBe(true);
    });

    it('returns the fallback AgentResult when the provider throws AgentFallbackError', async () => {
      const chat = jest.fn().mockImplementation(async () => {
        throw new AgentFallbackError({
          agentName: 'RecommendationAgent',
          success: true,
          messages: [],
          expectedOutputs: [],
          recommendations: [
            {
              type: 'optimization',
              severity: 'low',
              title: 'AI recommendations unavailable',
              description: 'Run in online mode for personalized pipeline recommendations.',
              autoFixAvailable: false,
            },
          ],
          warnings: [],
        });
      });
      const provider = createProvider(chat);
      const agent = new RecommendationAgent(provider, onlineCredentials, new AgentCache({ cachePath }));

      const result = await agent.run(createContext());

      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0]?.title).toBe('AI recommendations unavailable');
    });

    it('uses the offline fallback when credentials are offline', async () => {
      const chat = jest.fn();
      const provider = createProvider(chat);
      const agent = new RecommendationAgent(
        provider,
        offlineCredentials,
        new AgentCache({ cachePath }),
      );

      const result = await agent.run(
        createContext({
          config: createConfig({
            detected: { ...buildDetected(), framework: Framework.EXPRESS },
            user: { ...buildUser(), deploymentTarget: DeploymentTarget.AWS_EC2 },
          }),
        }),
      );

      expect(chat).not.toHaveBeenCalled();
      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0]).toMatchObject({
        type: 'optimization',
        severity: 'low',
        title: 'AI recommendations unavailable',
      });
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages[0]?.text).toContain('unavailable');
    });

    it('builds the prompt with framework, deployment target, and generated files', async () => {
      const chat = jest.fn().mockResolvedValue('{"recommendations":[],"expectedOutputs":[]}');
      const provider = createProvider(chat);
      const agent = new RecommendationAgent(provider, onlineCredentials, new AgentCache({ cachePath }));
      const context = createContext({
        config: createConfig({
          detected: { ...buildDetected(), framework: Framework.EXPRESS },
          user: { ...buildUser(), deploymentTarget: DeploymentTarget.AWS_EC2 },
        }),
        generatedFiles: ['.github/workflows/ci.yml', 'Dockerfile', '.github/workflows/deploy.yml'],
      });

      await agent.run(context);

      const userMessage = getLastUserMessage(chat);
      expect(userMessage).toContain('express');
      expect(userMessage).toContain('aws_ec2');
      expect(userMessage).toContain('.github/workflows/ci.yml');
      expect(userMessage).toContain('Dockerfile');
      expect(userMessage).toContain('Task');
    });

    it('includes the diff summary from last-run.json in the prompt', async () => {
      const chat = jest.fn().mockResolvedValue('{"recommendations":[],"expectedOutputs":[]}');
      const provider = createProvider(chat);
      const agent = new RecommendationAgent(provider, onlineCredentials, new AgentCache({ cachePath }));
      const lastRun = createLastRun({
        generationResult: {
          written: ['.github/workflows/ci.yml', 'Dockerfile'],
          skipped: ['.github/workflows/deploy.yml'],
          backed_up: [],
          errors: [{ path: 'Dockerfile', error: 'template missing' }],
        },
      });

      await agent.run(createContext({ lastRunJson: lastRun }));

      const userMessage = getLastUserMessage(chat);
      expect(userMessage).toContain('What Changed');
      expect(userMessage).toContain('abc123');
      expect(userMessage).toContain('Dockerfile');
      expect(userMessage).toContain('template missing');
    });

    it('includes previously unresolved recommendations in the prompt when a store is provided', async () => {
      const chat = jest.fn().mockResolvedValue('{"recommendations":[],"expectedOutputs":[]}');
      const provider = createProvider(chat);
      const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-rec-agent-'));
      const storeFs = new DevForgeFS(storeDir);
      const store = new RecommendationStore(storeFs, '2.0.0');

      await store.save([
        {
          type: 'security',
          severity: 'high',
          title: 'Rotate tokens',
          description: 'Rotate exposed deployment tokens',
          autoFixAvailable: false,
        },
      ]);

      const agent = new RecommendationAgent(
        provider,
        onlineCredentials,
        new AgentCache({ cachePath }),
        store,
      );

      await agent.run(createContext());

      const userMessage = getLastUserMessage(chat);
      expect(userMessage).toContain('Previously flagged and not yet resolved');
      expect(userMessage).toContain('Rotate tokens');

      await fs.rm(storeDir, { recursive: true, force: true });
    });

    it('includes failureSignals with error severity in the prompt when present', async () => {
      const chat = jest.fn().mockResolvedValue('{"recommendations":[],"expectedOutputs":[]}');
      const provider = createProvider(chat);
      const agent = new RecommendationAgent(provider, onlineCredentials, new AgentCache({ cachePath }));
      const context = createContext({
        failureSignals: [
          {
            type: 'missing_script',
            severity: 'error',
            message: 'Workflow includes a test step but no test script was detected',
            affectedFile: '.github/workflows/base-ci.yml',
          },
        ],
      });

      await agent.run(context);

      const userMessage = getLastUserMessage(chat);
      expect(userMessage).toContain('Pipeline Failure');
      expect(userMessage).toContain('missing_script');
      expect(userMessage).toContain('no test script was detected');
      expect(userMessage).toContain('fixing these issues first');
    });

    it('truncates the prompt to 4000 characters when context is too large', async () => {
      const chat = jest.fn().mockResolvedValue('{"recommendations":[],"expectedOutputs":[]}');
      const provider = createProvider(chat);
      const agent = new RecommendationAgent(provider, onlineCredentials, new AgentCache({ cachePath }));
      const hugeFiles = Array.from({ length: 500 }, (_, i) => `.github/workflows/workflow-${i}.yml`);
      const hugeLastRun = createLastRun({
        generationResult: {
          written: hugeFiles,
          skipped: [],
          backed_up: [],
          errors: [],
        },
      });

      const context = createContext({
        generatedFiles: hugeFiles,
        lastRunJson: hugeLastRun,
      });

      await agent.run(context);

      const userMessage = getLastUserMessage(chat);
      expect(userMessage.length).toBeLessThanOrEqual(4000);
      expect(userMessage).toContain('Task');
    });
  });

  describe('fallback()', () => {
    it('returns a static low-severity optimization recommendation', () => {
      const agent = new RecommendationAgent(
        createProvider(jest.fn()),
        onlineCredentials,
        new AgentCache({ cachePath }),
      );

      const result = agent['fallback'](createContext());

      expect(result.agentName).toBe('RecommendationAgent');
      expect(result.success).toBe(true);
      expect(result.recommendations).toEqual([
        {
          type: 'optimization',
          severity: 'low',
          title: 'AI recommendations unavailable',
          description: 'Run in online mode for personalized pipeline recommendations.',
          autoFixAvailable: false,
        },
      ]);
      expect(result.warnings).toEqual([]);
      expect(result.messages.length).toBeGreaterThan(0);
    });
  });
});

describe('buildExpectedOutputsFromConfig()', () => {
  it('returns Next.js + Vercel expected outputs', () => {
    const outputs = buildExpectedOutputsFromConfig(
      createConfig({
        detected: { ...buildDetected(), framework: Framework.NEXTJS },
        user: { ...buildUser(), deploymentTarget: DeploymentTarget.VERCEL },
      }),
    );

    expect(outputs.length).toBeGreaterThan(0);
    expect(outputs.some((o) => /next/i.test(o))).toBe(true);
    expect(outputs.some((o) => /vercel/i.test(o))).toBe(true);
  });

  it('returns Express + AWS EC2 expected outputs', () => {
    const outputs = buildExpectedOutputsFromConfig(
      createConfig({
        detected: { ...buildDetected(), framework: Framework.EXPRESS },
        user: { ...buildUser(), deploymentTarget: DeploymentTarget.AWS_EC2 },
      }),
    );

    expect(outputs.length).toBeGreaterThan(0);
    expect(outputs.some((o) => /express/i.test(o))).toBe(true);
    expect(outputs.some((o) => /ec2|ecr|ssh/i.test(o))).toBe(true);
  });

  it('returns Railway outputs for Railway target', () => {
    const outputs = buildExpectedOutputsFromConfig(
      createConfig({
        user: { ...buildUser(), deploymentTarget: DeploymentTarget.RAILWAY },
      }),
    );

    expect(outputs.some((o) => /railway/i.test(o))).toBe(true);
  });

  it('returns Docker outputs for Docker target', () => {
    const outputs = buildExpectedOutputsFromConfig(
      createConfig({
        user: { ...buildUser(), deploymentTarget: DeploymentTarget.DOCKER },
      }),
    );

    expect(outputs.some((o) => /docker/i.test(o))).toBe(true);
  });

  it('returns Firebase outputs for Firebase target', () => {
    const outputs = buildExpectedOutputsFromConfig(
      createConfig({
        user: { ...buildUser(), deploymentTarget: DeploymentTarget.FIREBASE },
      }),
    );

    expect(outputs.some((o) => /firebase/i.test(o))).toBe(true);
  });

  it('includes install command in the outputs', () => {
    const outputs = buildExpectedOutputsFromConfig(
      createConfig({
        detected: { ...buildDetected(), installCommand: 'pnpm install --frozen-lockfile' },
      }),
    );

    expect(outputs.some((o) => o.includes('pnpm install --frozen-lockfile'))).toBe(true);
  });

  it('includes test command in the outputs when present', () => {
    const outputs = buildExpectedOutputsFromConfig(
      createConfig({
        detected: { ...buildDetected(), testCommand: 'jest --ci' },
      }),
    );

    expect(outputs.some((o) => o.includes('jest --ci'))).toBe(true);
  });

  it('omits test command line when testCommand is null', () => {
    const outputs = buildExpectedOutputsFromConfig(
      createConfig({
        detected: { ...buildDetected(), testCommand: null },
      }),
    );

    expect(outputs.some((o) => /Run tests via/.test(o))).toBe(false);
  });
});
