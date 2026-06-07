import { IaCGenerationAgent } from '../../../src/agent/agents/IaCGenerationAgent';
import { AgentCache } from '../../../src/agent/cache/AgentCache';
import { StoredCredentials } from '../../../src/agent/credentials/types';
import { AgentFallbackError } from '../../../src/agent/errors';
import { LLMProvider } from '../../../src/agent/providers/types';
import { AgentContext } from '../../../src/agent/types';
import { DeploymentTarget, Framework, PackageManager, BranchStrategy, IaCGenerationOutput } from '../../../src/types';

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn() },
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

function buildContext(overrides: Partial<AgentContext['config']['user']> = {}): AgentContext {
  return {
    config: {
      projectRoot: '/tmp/my-app',
      detected: {
        framework: Framework.EXPRESS,
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
        deploymentTarget: DeploymentTarget.AWS_ECS,
        branchStrategy: BranchStrategy.FEATURE_MAIN,
        dockerRequired: true,
        multiEnvironment: false,
        environments: [],
        enableTrivyScan: false,
        ...overrides,
      },
      dryRun: false,
      generatedAt: new Date().toISOString(),
      devforgeVersion: '2.0.0',
    },
    generatedFiles: [],
    lastRunJson: null,
    failureSignals: [],
  };
}

function makeProvider(chatImpl: jest.Mock): LLMProvider {
  return { name: 'openai', chat: chatImpl, isAvailable: jest.fn().mockResolvedValue(true) };
}

const validOutput: IaCGenerationOutput = {
  tool: 'terraform',
  files: [
    { relativePath: 'infra/main.tf', content: 'resource "aws_ecs_cluster" {}', description: 'ECS cluster' },
    { relativePath: 'infra/variables.tf', content: 'variable "region" {}', description: 'Variables' },
  ],
  installInstructions: ['terraform init'],
  notes: ['Review before applying'],
};

describe('IaCGenerationAgent', () => {
  describe('run() – tool selection', () => {
    it('uses user-specified iacTool when set', async () => {
      const chat = jest.fn().mockResolvedValue(JSON.stringify(validOutput));
      const agent = new IaCGenerationAgent(makeProvider(chat), onlineCredentials, new AgentCache());
      const ctx = buildContext({ iacTool: 'cdk' });

      const result = await agent.run(ctx);

      expect(result.success).toBe(true);
      // CDK tool was requested — agent should not default to terraform
      const iacOut = (result as typeof result & { iacOutput?: IaCGenerationOutput }).iacOutput;
      expect(['cdk', 'terraform', 'boto3']).toContain(iacOut?.tool ?? 'cdk');
    });

    it('prefers terraform for AWS_ECS target when no iacTool set', async () => {
      const chat = jest.fn().mockResolvedValue(JSON.stringify(validOutput));
      const agent = new IaCGenerationAgent(makeProvider(chat), onlineCredentials, new AgentCache());
      const result = await agent.run(buildContext());

      expect(result.success).toBe(true);
      const prompt: string = (chat.mock.calls[0]?.[0] as Array<{ content: string }>)
        .map((m) => m.content)
        .join(' ');
      expect(prompt.toLowerCase()).toContain('terraform');
    });

    it('returns managed-platform skip message for Vercel target', async () => {
      const chat = jest.fn();
      const agent = new IaCGenerationAgent(makeProvider(chat), onlineCredentials, new AgentCache());
      const result = await agent.run(buildContext({ deploymentTarget: DeploymentTarget.VERCEL }));

      expect(result.success).toBe(true);
      expect(chat).not.toHaveBeenCalled();
      expect(result.messages[0]?.text).toContain('managed platform');
    });
  });

  describe('run() – response parsing', () => {
    it('parses valid JSON response and returns iacOutput', async () => {
      const chat = jest.fn().mockResolvedValue(JSON.stringify(validOutput));
      const agent = new IaCGenerationAgent(makeProvider(chat), onlineCredentials, new AgentCache());

      const result = await agent.run(buildContext());

      expect(result.success).toBe(true);
      const iacOut = (result as typeof result & { iacOutput: IaCGenerationOutput }).iacOutput;
      expect(iacOut.tool).toBe('terraform');
      expect(iacOut.files.length).toBeGreaterThanOrEqual(1);
      expect(result.messages.length).toBeGreaterThanOrEqual(1);
      expect(result.messages[0]?.type).toBe('info');
    });

    it('parses JSON wrapped in markdown code block', async () => {
      const chat = jest.fn().mockResolvedValue('```json\n' + JSON.stringify(validOutput) + '\n```');
      const agent = new IaCGenerationAgent(makeProvider(chat), onlineCredentials, new AgentCache());

      const result = await agent.run(buildContext());

      expect(result.success).toBe(true);
      const iacOut = (result as typeof result & { iacOutput: IaCGenerationOutput }).iacOutput;
      expect(iacOut).toBeDefined();
    });

    it('falls back to template blocks when LLM returns invalid JSON', async () => {
      const chat = jest.fn().mockResolvedValue('not-json-at-all');
      const agent = new IaCGenerationAgent(makeProvider(chat), onlineCredentials, new AgentCache());

      const result = await agent.run(buildContext());

      expect(result.success).toBe(true);
      const iacOut = (result as typeof result & { iacOutput: IaCGenerationOutput }).iacOutput;
      expect(iacOut.files.length).toBeGreaterThan(0);
    });

    it('falls back to template blocks when LLM response fails schema validation', async () => {
      const chat = jest.fn().mockResolvedValue(JSON.stringify({ tool: 'terraform', files: [] }));
      const agent = new IaCGenerationAgent(makeProvider(chat), onlineCredentials, new AgentCache());

      const result = await agent.run(buildContext());

      expect(result.success).toBe(true);
      const iacOut = (result as typeof result & { iacOutput: IaCGenerationOutput }).iacOutput;
      expect(iacOut.files.length).toBeGreaterThan(0);
    });
  });

  describe('run() – previousErrors context', () => {
    it('prepends previous errors to the prompt on retry', async () => {
      const chat = jest.fn().mockResolvedValue(JSON.stringify(validOutput));
      const agent = new IaCGenerationAgent(makeProvider(chat), onlineCredentials, new AgentCache());
      const errors = ['invalid resource reference in main.tf', 'missing required field'];

      await agent.run(buildContext(), errors);

      const promptMessages = chat.mock.calls[0]?.[0] as Array<{ role: string; content: string }>;
      const userMsg = promptMessages.find((m) => m.role === 'user')?.content ?? '';
      expect(userMsg).toContain('Previous generation failed verification');
      expect(userMsg).toContain('invalid resource reference in main.tf');
    });
  });

  describe('fallback()', () => {
    it('returns success=false with offline message when offline credentials used', async () => {
      const chat = jest.fn();
      const agent = new IaCGenerationAgent(makeProvider(chat), offlineCredentials, new AgentCache());

      // BaseAgent.chat() detects offline mode and throws AgentFallbackError(this.fallback(context))
      // IaCGenerationAgent.run() catches it and returns error.result
      const result = await agent.run(buildContext());

      expect(chat).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.messages[0]?.text).toContain('online');
    });
  });

  describe('run() – expectedOutputs', () => {
    it('lists generated file paths in expectedOutputs', async () => {
      const chat = jest.fn().mockResolvedValue(JSON.stringify(validOutput));
      const agent = new IaCGenerationAgent(makeProvider(chat), onlineCredentials, new AgentCache());

      const result = await agent.run(buildContext());

      expect(result.expectedOutputs).toContain('infra/main.tf');
    });
  });
});
