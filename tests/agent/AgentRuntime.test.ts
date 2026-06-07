import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import ora from 'ora';
import { AgentRuntime } from '../../src/agent/AgentRuntime';
import { BaseAgent } from '../../src/agent/BaseAgent';
import { AgentCache } from '../../src/agent/cache/AgentCache';
import { buildCacheKey } from '../../src/agent/cache/cacheKey';
import { StoredCredentials } from '../../src/agent/credentials/types';
import { AgentFallbackError } from '../../src/agent/errors';
import { AgentContext, AgentResult } from '../../src/agent/types';
import { LLMProvider } from '../../src/agent/providers/types';
import {
  BranchStrategy,
  DeploymentTarget,
  DevForgeConfig,
  Framework,
  PackageManager,
} from '../../src/types';

const mockSpinner = {
  start: jest.fn().mockReturnThis(),
  succeed: jest.fn().mockReturnThis(),
  fail: jest.fn().mockReturnThis(),
  warn: jest.fn().mockReturnThis(),
  stop: jest.fn().mockReturnThis(),
};

jest.mock('ora', () => ({
  __esModule: true,
  default: jest.fn(() => mockSpinner),
}));

jest.mock('../../src/utils/logger', () => ({
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

function createContext(): AgentContext {
  const config: DevForgeConfig = {
    projectRoot: '/tmp/project',
    detected: {
      framework: Framework.REACT,
      packageManager: PackageManager.NPM,
      nodeVersion: '20',
      hasDocker: false,
      hasTests: true,
      hasLinting: true,
      testCommand: 'npm test',
      buildCommand: 'npm run build',
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
    devforgeVersion: '1.0.0',
  };

  return {
    config,
    generatedFiles: ['.github/workflows/ci.yml'],
    lastRunJson: null,
    failureSignals: [],
  };
}

class TestAgent extends BaseAgent {
  readonly agentName: string;
  private readonly runImpl: (context: AgentContext) => Promise<AgentResult>;
  private readonly fallbackImpl: (context: AgentContext) => AgentResult;

  constructor(
    provider: LLMProvider,
    agentName: string,
    runImpl: (context: AgentContext) => Promise<AgentResult>,
    fallbackImpl: (context: AgentContext) => AgentResult,
    storedCredentials: StoredCredentials = onlineCredentials,
    cache?: AgentCache,
    systemPrompt = 'You are a test agent.',
  ) {
    super(provider, systemPrompt, storedCredentials, cache);
    this.agentName = agentName;
    this.runImpl = runImpl;
    this.fallbackImpl = fallbackImpl;
  }

  protected fallback(context: AgentContext): AgentResult {
    return this.fallbackImpl(context);
  }

  async run(context: AgentContext): Promise<AgentResult> {
    return this.runImpl(context);
  }

  chatForTest(userMessage: string, context: AgentContext): Promise<string> {
    return this.chat(userMessage, context);
  }
}

describe('AgentRuntime', () => {
  let runtime: AgentRuntime;
  let context: AgentContext;

  beforeEach(() => {
    jest.clearAllMocks();
    runtime = new AgentRuntime();
    context = createContext();
  });

  it('runForeground() returns agent results and uses ora spinner', async () => {
    const agent = new TestAgent(
      { name: 'mock', chat: jest.fn(), isAvailable: jest.fn() },
      'success-agent',
      async () => ({
        agentName: 'success-agent',
        success: true,
        messages: [{ type: 'success', text: 'All good' }],
        expectedOutputs: [],
        recommendations: [],
        warnings: [],
      }),
      () => ({
        agentName: 'success-agent',
        success: false,
        messages: [],
        expectedOutputs: [],
        recommendations: [],
        warnings: [],
      }),
    );

    const result = await runtime.runForeground(agent, context);

    expect(result.success).toBe(true);
    expect(ora).toHaveBeenCalledWith('Running success-agent...');
    expect(mockSpinner.start).toHaveBeenCalled();
    expect(mockSpinner.succeed).toHaveBeenCalledWith('success-agent completed');
  });

  it('runForeground() catches agent failures without throwing', async () => {
    const agent = new TestAgent(
      { name: 'mock', chat: jest.fn(), isAvailable: jest.fn() },
      'failing-agent',
      async () => {
        throw new Error('provider exploded');
      },
      () => ({
        agentName: 'failing-agent',
        success: false,
        messages: [],
        expectedOutputs: [],
        recommendations: [],
        warnings: [],
      }),
    );

    await expect(runtime.runForeground(agent, context)).resolves.toEqual({
      agentName: 'failing-agent',
      success: false,
      messages: [
        {
          type: 'warn',
          text: 'failing-agent could not complete: provider exploded',
        },
      ],
      expectedOutputs: [],
      recommendations: [],
      warnings: [],
    });
    expect(mockSpinner.fail).toHaveBeenCalledWith('failing-agent failed');
  });

  it('runAll() continues after a foreground agent failure', async () => {
    const failingAgent = new TestAgent(
      { name: 'mock', chat: jest.fn(), isAvailable: jest.fn() },
      'failing-agent',
      async () => {
        throw new Error('boom');
      },
      () => ({
        agentName: 'failing-agent',
        success: false,
        messages: [],
        expectedOutputs: [],
        recommendations: [],
        warnings: [],
      }),
    );
    const successAgent = new TestAgent(
      { name: 'mock', chat: jest.fn(), isAvailable: jest.fn() },
      'success-agent',
      async () => ({
        agentName: 'success-agent',
        success: true,
        messages: [{ type: 'info', text: 'done' }],
        expectedOutputs: [],
        recommendations: [],
        warnings: [],
      }),
      () => ({
        agentName: 'success-agent',
        success: false,
        messages: [],
        expectedOutputs: [],
        recommendations: [],
        warnings: [],
      }),
    );

    const results = await runtime.runAll(
      [failingAgent, successAgent],
      context,
      'foreground',
    );

    expect(results).toHaveLength(2);
    expect(results[0]?.success).toBe(false);
    expect(results[1]?.success).toBe(true);
  });

  it('runAll() starts background agents without returning results', async () => {
    const runSpy = jest.fn().mockResolvedValue({
      agentName: 'background-agent',
      success: true,
      messages: [],
      recommendations: [],
      warnings: [],
    });
    const agent = new TestAgent(
      { name: 'mock', chat: jest.fn(), isAvailable: jest.fn() },
      'background-agent',
      runSpy,
      () => ({
        agentName: 'background-agent',
        success: false,
        messages: [],
        expectedOutputs: [],
        recommendations: [],
        warnings: [],
      }),
    );

    const results = await runtime.runAll([agent], context, 'background');
    expect(results).toEqual([]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runSpy).toHaveBeenCalled();
  });
});

describe('BaseAgent chat and cache', () => {
  let tempDir: string;
  let cachePath: string;
  let context: AgentContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-agent-cache-'));
    cachePath = path.join(tempDir, 'agent-cache.json');
    context = createContext();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('caches provider responses and reuses them on subsequent chat calls', async () => {
    const chat = jest.fn().mockResolvedValue('fresh response');
    const provider: LLMProvider = {
      name: 'mock',
      chat,
      isAvailable: jest.fn().mockResolvedValue(true),
    };
    const cache = new AgentCache({ cachePath });
    const agent = new TestAgent(
      provider,
      'cache-agent',
      async () => ({
        agentName: 'cache-agent',
        success: true,
        messages: [],
        expectedOutputs: [],
        recommendations: [],
        warnings: [],
      }),
      () => ({
        agentName: 'cache-agent',
        success: false,
        messages: [],
        expectedOutputs: [],
        recommendations: [],
        warnings: [],
      }),
      onlineCredentials,
      cache,
    );

    await expect(agent.chatForTest('hello', context)).resolves.toBe('fresh response');
    await expect(agent.chatForTest('hello', context)).resolves.toBe('fresh response');
    expect(chat).toHaveBeenCalledTimes(1);

    const raw = await fs.readFile(cachePath, 'utf-8');
    expect(raw).toContain('fresh response');
    expect(raw).toContain(
      buildCacheKey('cache-agent', 'You are a test agent.', 'hello'),
    );
  });

  it('trims conversation history to 20 messages', async () => {
    const chat = jest
      .fn()
      .mockImplementation(async (messages) => `reply-${messages.length}`);
    const provider: LLMProvider = {
      name: 'mock',
      chat,
      isAvailable: jest.fn().mockResolvedValue(true),
    };
    const agent = new TestAgent(
      provider,
      'history-agent',
      async () => ({
        agentName: 'history-agent',
        success: true,
        messages: [],
        expectedOutputs: [],
        recommendations: [],
        warnings: [],
      }),
      () => ({
        agentName: 'history-agent',
        success: false,
        messages: [],
        expectedOutputs: [],
        recommendations: [],
        warnings: [],
      }),
      onlineCredentials,
      new AgentCache({ cachePath }),
    );

    for (let index = 0; index < 12; index += 1) {
      await agent.chatForTest(`message-${index}`, context);
    }

    expect(agent['history']).toHaveLength(20);
  });

  it('throws AgentFallbackError in offline mode before calling the provider', async () => {
    const chat = jest.fn();
    const provider: LLMProvider = {
      name: 'mock',
      chat,
      isAvailable: jest.fn().mockResolvedValue(true),
    };
    const agent = new TestAgent(
      provider,
      'offline-agent',
      async () => ({
        agentName: 'offline-agent',
        success: true,
        messages: [],
        expectedOutputs: [],
        recommendations: [],
        warnings: [],
      }),
      () => ({
        agentName: 'offline-agent',
        success: true,
        messages: [{ type: 'info', text: 'fallback used' }],
        expectedOutputs: [],
        recommendations: [],
        warnings: [],
      }),
      offlineCredentials,
    );

    await expect(agent.chatForTest('hello', context)).rejects.toBeInstanceOf(
      AgentFallbackError,
    );
    expect(chat).not.toHaveBeenCalled();
  });

  it('throws AgentFallbackError when provider is unavailable', async () => {
    const provider: LLMProvider = {
      name: 'mock',
      chat: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(false),
    };
    const agent = new TestAgent(
      provider,
      'unavailable-agent',
      async () => ({
        agentName: 'unavailable-agent',
        success: true,
        messages: [],
        expectedOutputs: [],
        recommendations: [],
        warnings: [],
      }),
      () => ({
        agentName: 'unavailable-agent',
        success: true,
        messages: [{ type: 'info', text: 'provider unavailable' }],
        expectedOutputs: [],
        recommendations: [],
        warnings: [],
      }),
    );

    await expect(agent.chatForTest('hello', context)).rejects.toBeInstanceOf(
      AgentFallbackError,
    );
  });
});
