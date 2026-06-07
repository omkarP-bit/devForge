import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { AgentResult } from '../../../src/agent/types';
import { runSecurityRemediationGraph } from '../../../src/agent/graph/runSecurityRemediationGraph';
import { DevForgeConfig, Framework, PackageManager, DeploymentTarget, BranchStrategy } from '../../../src/types';
import { DevForgeFS } from '../../../src/utils/fs';
import { ComplianceViolation } from '../../../src/agent/security/StaticSecurityScanner';

const scanViolations: ComplianceViolation[] = [
  {
    controlId: 'NIST-AC-6',
    standard: 'NIST',
    title: 'missing permissions block',
    description: 'desc',
    affectedFile: '.github/workflows/ci.yml',
    severity: 'high',
    remediation: 'add permissions',
  },
];

const cleanResult: AgentResult = {
  agentName: 'SecurityComplianceAgent',
  success: true,
  messages: [],
  expectedOutputs: [],
  recommendations: [],
  warnings: [],
};

describe('securityRemediationGraph', () => {
  let tempDir: string;
  let fsAdapter: DevForgeFS;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-remediation-'));
    fsAdapter = new DevForgeFS(tempDir);
    await fsAdapter.ensureDir('.github/workflows');
    await fsAdapter.writeFile('.github/workflows/ci.yml', 'name: CI\n');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('loops scan → approval → auto_fix when fixes are approved', async () => {
    let scanCount = 0;

    const state = await runSecurityRemediationGraph(
      {
        context: {
          config: buildConfig(tempDir),
          generatedFiles: ['.github/workflows/ci.yml'],
          lastRunJson: null,
          failureSignals: [],
        },
        credentials: {
          provider: 'openai',
          credentials: { OPENAI_API_KEY: 'test' },
          setupAt: new Date().toISOString(),
          version: 1,
        },
        autoApprove: true,
        maxFixAttempts: 2,
      },
      {
        fs: fsAdapter,
        dependencies: {
          createSecurityAgent: () => ({
            run: async () => {
              scanCount += 1;
              if (scanCount === 1) {
                return {
                  agentName: 'SecurityComplianceAgent',
                  success: true,
                  messages: [],
                  expectedOutputs: [],
                  recommendations: scanViolations.map((violation) => ({
                    type: 'security' as const,
                    severity: violation.severity,
                    title: `[${violation.controlId}] ${violation.title}`,
                    description: violation.description,
                    autoFixAvailable: true,
                  })),
                  warnings: [],
                };
              }
              return cleanResult;
            },
          }),
        },
      },
    );

    expect(scanCount).toBeGreaterThanOrEqual(2);
    expect(state.fixAttempts).toBeGreaterThanOrEqual(1);
  });

  it('stops when auto-fix is not approved in CI without --yes', async () => {
    const originalCi = process.env.CI;
    process.env.CI = 'true';

    const state = await runSecurityRemediationGraph(
      {
        context: {
          config: buildConfig(tempDir),
          generatedFiles: ['.github/workflows/ci.yml'],
          lastRunJson: null,
          failureSignals: [],
        },
        credentials: {
          provider: 'openai',
          credentials: { OPENAI_API_KEY: 'test' },
          setupAt: new Date().toISOString(),
          version: 1,
        },
        autoApprove: false,
      },
      {
        fs: fsAdapter,
        dependencies: {
          createSecurityAgent: () => ({
            run: async () => ({
              agentName: 'SecurityComplianceAgent',
              success: true,
              messages: [],
              expectedOutputs: [],
              recommendations: scanViolations.map((violation) => ({
                type: 'security' as const,
                severity: violation.severity,
                title: `[${violation.controlId}] ${violation.title}`,
                description: violation.description,
                autoFixAvailable: true,
              })),
              warnings: [],
            }),
          }),
        },
      },
    );

    expect(state.approved).toBe(false);
    expect(state.errors.join(' ')).toContain('--yes');

    process.env.CI = originalCi;
  });
});

function buildConfig(projectRoot: string): DevForgeConfig {
  return {
    projectRoot,
    detected: {
      framework: Framework.UNKNOWN,
      packageManager: PackageManager.NPM,
      nodeVersion: '20',
      hasDocker: false,
      hasTests: false,
      hasLinting: false,
      testCommand: null,
      buildCommand: null,
      installCommand: 'npm ci',
      detectedAt: new Date().toISOString(),
    },
    user: {
      deploymentTarget: DeploymentTarget.DOCKER,
      branchStrategy: BranchStrategy.FEATURE_MAIN,
      dockerRequired: false,
      multiEnvironment: false,
      environments: [],
    },
    dryRun: false,
    generatedAt: new Date().toISOString(),
    devforgeVersion: '2.1.0',
  };
}
