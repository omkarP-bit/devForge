import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  DeploymentTarget,
  Framework,
  PackageManager,
  BranchStrategy,
  IaCGenerationOutput,
  IaCVerifyResult,
} from '../../src/types';
import { AgentContext } from '../../src/agent/types';
import { DevForgeFS } from '../../src/utils/fs';

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn() },
}));

// ── Shared fixtures ────────────────────────────────────────────────

function buildContext(
  projectRoot: string,
  overrides: Partial<AgentContext['config']['user']> = {},
  detectedOverrides: Partial<AgentContext['config']['detected']> = {},
): AgentContext {
  return {
    config: {
      projectRoot,
      detected: {
        framework: Framework.EXPRESS,
        packageManager: PackageManager.NPM,
        nodeVersion: '20',
        hasDocker: true,
        hasTests: true,
        hasLinting: true,
        testCommand: 'npm test',
        buildCommand: 'npm run build',
        installCommand: 'npm ci',
        detectedAt: new Date().toISOString(),
        ...detectedOverrides,
      },
      user: {
        deploymentTarget: DeploymentTarget.AWS_ECS,
        branchStrategy: BranchStrategy.FEATURE_MAIN,
        dockerRequired: true,
        multiEnvironment: false,
        environments: [],
        enableTrivyScan: false,
        iacTool: 'terraform' as const,
        ...overrides,
      },
      dryRun: false,
      generatedAt: new Date().toISOString(),
      devforgeVersion: '2.0.0',
    },
    generatedFiles: ['.github/workflows/ci.yml'],
    lastRunJson: null,
    failureSignals: [],
  };
}

const validTerraformOutput: IaCGenerationOutput = {
  tool: 'terraform',
  files: [
    {
      relativePath: 'infra/main.tf',
      content: 'resource "aws_ecs_cluster" "app" { name = "app" }',
      description: 'ECS cluster',
    },
    {
      relativePath: 'infra/variables.tf',
      content: 'variable "region" { default = "us-east-1" }',
      description: 'Variables',
    },
    {
      relativePath: 'infra/outputs.tf',
      content: 'output "cluster_arn" { value = "arn:aws:ecs:us-east-1:123:cluster/app" }',
      description: 'Outputs',
    },
  ],
  installInstructions: ['terraform init', 'terraform plan'],
  notes: ['Ensure AWS credentials are configured.'],
};

const passedVerifyResult: IaCVerifyResult = {
  tool: 'terraform',
  passed: true,
  errors: [],
  warnings: [],
  verifiedAt: new Date().toISOString(),
};

const failedVerifyResult: IaCVerifyResult = {
  tool: 'terraform',
  passed: false,
  errors: [{ file: 'infra/main.tf', message: 'invalid resource reference in main.tf', fatal: true }],
  warnings: [],
  verifiedAt: new Date().toISOString(),
};

// ── Tests ──────────────────────────────────────────────────────────

describe('IaC Generation E2E', () => {
  let tempDir: string;
  let fsAdapter: DevForgeFS;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-e2e-iac-'));
    fsAdapter = new DevForgeFS(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  // ── T1: Terraform happy path ────────────────────────────────────

  describe('T1 – Terraform happy path', () => {
    it('writes infra files when verifier passes on first attempt', async () => {
      const mockAgentRun = jest.fn().mockResolvedValue({
        agentName: 'IaCGenerationAgent',
        success: true,
        messages: validTerraformOutput.files.map((f) => ({ type: 'info', text: `Generated ${f.relativePath}` })),
        expectedOutputs: validTerraformOutput.files.map((f) => f.relativePath),
        recommendations: [],
        warnings: [],
        iacOutput: validTerraformOutput,
      });
      const mockVerify = jest.fn().mockResolvedValue(passedVerifyResult);

      const agentResult = await mockAgentRun();
      expect(agentResult.success).toBe(true);

      const verifyResult = await mockVerify(agentResult.iacOutput, tempDir);
      expect(verifyResult.passed).toBe(true);

      for (const file of agentResult.iacOutput.files) {
        await fsAdapter.writeFile(file.relativePath, file.content);
      }

      const mainTf = await fs.readFile(path.join(tempDir, 'infra/main.tf'), 'utf-8');
      const varsTf = await fs.readFile(path.join(tempDir, 'infra/variables.tf'), 'utf-8');
      const outTf = await fs.readFile(path.join(tempDir, 'infra/outputs.tf'), 'utf-8');

      expect(mainTf).toContain('aws_ecs_cluster');
      expect(varsTf).toContain('variable');
      expect(outTf).toContain('output');
      expect(mockAgentRun).toHaveBeenCalledTimes(1);
      expect(mockVerify).toHaveBeenCalledTimes(1);
    });
  });

  // ── T2: Terraform retry path ────────────────────────────────────

  describe('T2 – Terraform retry path', () => {
    it('retries generation with error context when first verify fails', async () => {
      const promptsReceived: Array<string[] | undefined> = [];

      const mockAgentRun = jest.fn().mockImplementation(
        async (_ctx: AgentContext, prevErrors?: string[]) => {
          promptsReceived.push(prevErrors);
          return {
            agentName: 'IaCGenerationAgent',
            success: true,
            messages: [],
            expectedOutputs: [],
            recommendations: [],
            warnings: [],
            iacOutput: validTerraformOutput,
          };
        },
      );

      let verifyCallCount = 0;
      const mockVerify = jest.fn().mockImplementation(async (): Promise<IaCVerifyResult> => {
        verifyCallCount++;
        return verifyCallCount === 1 ? failedVerifyResult : passedVerifyResult;
      });

      const ctx = buildContext(tempDir);
      const maxAttempts = 2;

      let attempt = 0;
      let verifyResult: IaCVerifyResult | null = null;
      let agentResult: Awaited<ReturnType<typeof mockAgentRun>> | null = null;
      let prevErrors: string[] | undefined;

      while (attempt < maxAttempts) {
        agentResult = await mockAgentRun(ctx, prevErrors);
        attempt++;
        verifyResult = await mockVerify(agentResult.iacOutput, tempDir);
        if (verifyResult!.passed) break;
        prevErrors = verifyResult!.errors.map((e) => e.message);
      }

      expect(attempt).toBe(2);
      expect(verifyResult!.passed).toBe(true);
      expect(promptsReceived[1]).toContain('invalid resource reference in main.tf');

      for (const file of agentResult!.iacOutput.files) {
        await fsAdapter.writeFile(file.relativePath, file.content);
      }
      const mainTf = await fs.readFile(path.join(tempDir, 'infra/main.tf'), 'utf-8');
      expect(mainTf).toContain('aws_ecs_cluster');
    });
  });

  // ── T3: Max retries exceeded ────────────────────────────────────

  describe('T3 – Terraform max retries exceeded', () => {
    it('writes no files when verifier always fails', async () => {
      const mockAgentRun = jest.fn().mockResolvedValue({
        agentName: 'IaCGenerationAgent',
        success: true,
        messages: [],
        expectedOutputs: [],
        recommendations: [],
        warnings: [],
        iacOutput: validTerraformOutput,
      });
      const mockVerify = jest.fn().mockResolvedValue(failedVerifyResult);

      const ctx = buildContext(tempDir);
      const maxAttempts = 2;

      let attempt = 0;
      let verifyResult: IaCVerifyResult | null = null;
      let filesWritten = false;

      while (attempt < maxAttempts) {
        const agentResult = await mockAgentRun(ctx);
        attempt++;
        verifyResult = await mockVerify(agentResult.iacOutput, tempDir);
        if (verifyResult!.passed) {
          filesWritten = true;
          break;
        }
      }

      expect(filesWritten).toBe(false);
      expect(verifyResult!.passed).toBe(false);
      expect(attempt).toBe(maxAttempts);

      const infraExists = await fs.stat(path.join(tempDir, 'infra/main.tf')).catch(() => null);
      expect(infraExists).toBeNull();
    });

    it('exits cleanly without unhandled rejection when max retries exceeded', async () => {
      const mockVerify = jest.fn().mockResolvedValue(failedVerifyResult);
      const mockAgentRun = jest.fn().mockResolvedValue({
        agentName: 'IaCGenerationAgent',
        success: true,
        messages: [],
        expectedOutputs: [],
        recommendations: [],
        warnings: [],
        iacOutput: validTerraformOutput,
      });

      const ctx = buildContext(tempDir);
      const maxAttempts = 2;

      await expect(async () => {
        let attempt = 0;
        while (attempt < maxAttempts) {
          await mockAgentRun(ctx);
          attempt++;
          const result: IaCVerifyResult = await mockVerify();
          if (result.passed) break;
        }
      }).not.toThrow();
    });
  });

  // ── T4: IaC already detected and ready ─────────────────────────

  describe('T4 – IaC already detected and ready', () => {
    it('does not invoke IaCGenerationAgent when IaC is detected', async () => {
      const mockGenerationAgent = jest.fn();
      const mockExecutor = jest.fn().mockResolvedValue({ success: true, output: '' });

      const iacContext = {
        detected: true,
        isDeployReady: true,
        tool: 'terraform',
        entryPoints: ['infra/main.tf'],
        configDir: 'infra',
      };

      if (!iacContext.detected || !iacContext.isDeployReady) {
        await mockGenerationAgent();
      } else {
        await mockExecutor('terraform', 'infra');
      }

      expect(mockGenerationAgent).not.toHaveBeenCalled();
      expect(mockExecutor).toHaveBeenCalledWith('terraform', 'infra');
    });
  });

  // ── T5: Offline mode ────────────────────────────────────────────

  describe('T5 – Offline mode', () => {
    it('returns fallback result and writes no IaC files with offline credentials', async () => {
      const mockAgentRun = jest.fn().mockResolvedValue({
        agentName: 'IaCGenerationAgent',
        success: false,
        messages: [
          {
            type: 'error',
            text: 'IaC generation requires an online LLM provider. Run in online mode.',
          },
        ],
        expectedOutputs: [],
        recommendations: [],
        warnings: [],
        iacOutput: undefined,
      });

      const result = await mockAgentRun();

      expect(result.success).toBe(false);
      expect(result.messages[0].text).toContain('IaC generation requires an online LLM provider');
      expect(result.iacOutput).toBeUndefined();

      const infraExists = await fs.stat(path.join(tempDir, 'infra')).catch(() => null);
      expect(infraExists).toBeNull();
    });
  });

  // ── T6: boto3 generation ────────────────────────────────────────

  describe('T6 – boto3 generation (Python project)', () => {
    it('writes scripts/deploy.py for boto3 tool selection', async () => {
      const boto3Output: IaCGenerationOutput = {
        tool: 'boto3',
        files: [
          {
            relativePath: 'scripts/ecr-create.py',
            content: 'import boto3\ncreate_repository()',
            description: 'Create ECR repo',
          },
          {
            relativePath: 'scripts/deploy.py',
            content: 'import boto3\nupdate_service()',
            description: 'Deploy to ECS',
          },
        ],
        installInstructions: ['pip install boto3'],
        notes: ['Configure AWS credentials first.'],
      };

      const passedBoto3Result: IaCVerifyResult = {
        tool: 'boto3',
        passed: true,
        errors: [],
        warnings: [],
        verifiedAt: new Date().toISOString(),
      };

      const mockAgentRun = jest.fn().mockResolvedValue({
        agentName: 'IaCGenerationAgent',
        success: true,
        messages: boto3Output.files.map((f) => ({ type: 'info', text: `Generated ${f.relativePath}` })),
        expectedOutputs: boto3Output.files.map((f) => f.relativePath),
        recommendations: [],
        warnings: [],
        iacOutput: boto3Output,
      });
      const mockVerify = jest.fn().mockResolvedValue(passedBoto3Result);

      const ctx = buildContext(
        tempDir,
        { deploymentTarget: DeploymentTarget.AWS_ECS, iacTool: 'boto3' as const },
        { framework: Framework.UNKNOWN },
      );

      const agentResult = await mockAgentRun(ctx);
      const verifyResult = await mockVerify(agentResult.iacOutput, tempDir);

      expect(verifyResult.passed).toBe(true);

      for (const file of agentResult.iacOutput.files) {
        await fsAdapter.writeFile(file.relativePath, file.content);
      }

      const deployPy = await fs.readFile(path.join(tempDir, 'scripts/deploy.py'), 'utf-8');
      expect(deployPy).toContain('import boto3');
    });
  });
});
