import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { AgentResult } from '../../../src/agent/types';
import { runPipelineDiagnosisGraph } from '../../../src/agent/graph/runPipelineDiagnosisGraph';
import { DevForgeConfig, Framework, PackageManager, DeploymentTarget, BranchStrategy } from '../../../src/types';
import { DevForgeFS } from '../../../src/utils/fs';

const recommendationResult: AgentResult = {
  agentName: 'RecommendationAgent',
  success: true,
  messages: [],
  expectedOutputs: ['build passes'],
  recommendations: [{ type: 'optimization', severity: 'low', title: 'Add cache', description: 'cache deps', autoFixAvailable: false }],
  warnings: [],
};

describe('pipelineDiagnosisGraph', () => {
  let tempDir: string;
  let fsAdapter: DevForgeFS;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-diagnosis-'));
    fsAdapter = new DevForgeFS(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('skips enrichment when no failure signals are detected', async () => {
    const enrichRun = jest.fn();

    const state = await runPipelineDiagnosisGraph(
      {
        context: {
          config: buildConfig(tempDir),
          generatedFiles: [],
          lastRunJson: null,
          failureSignals: [],
        },
        credentials: {
          provider: 'openai',
          credentials: { OPENAI_API_KEY: 'test' },
          setupAt: new Date().toISOString(),
          version: 1,
        },
        skipReport: true,
      },
      {
        fs: fsAdapter,
        devforgeVersion: '2.1.0',
        dependencies: {
          createRecommendationAgent: () => ({ run: enrichRun }),
        },
      },
    );

    expect(enrichRun).not.toHaveBeenCalled();
    expect(state.recommendationResult).toBeNull();
  });

  it('runs enrichment when failure signals exist', async () => {
    const state = await runPipelineDiagnosisGraph(
      {
        context: {
          config: buildConfig(tempDir),
          generatedFiles: ['.github/workflows/ci.yml'],
          lastRunJson: null,
          failureSignals: [
            {
              type: 'missing_script',
              severity: 'error',
              message: 'Missing test script',
              affectedFile: 'package.json',
            },
          ],
        },
        credentials: {
          provider: 'openai',
          credentials: { OPENAI_API_KEY: 'test' },
          setupAt: new Date().toISOString(),
          version: 1,
        },
        skipReport: true,
      },
      {
        fs: fsAdapter,
        devforgeVersion: '2.1.0',
        dependencies: {
          createRecommendationAgent: () => ({ run: async () => recommendationResult }),
        },
      },
    );

    expect(state.recommendationResult?.recommendations).toHaveLength(1);
    expect(state.phase).toBe('diagnose');
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
