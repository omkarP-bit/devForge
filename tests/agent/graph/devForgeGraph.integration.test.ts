import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { AgentResult } from '../../../src/agent/types';
import { runDevForgeGraph } from '../../../src/agent/graph/runDevForgeGraph';
import { GraphMemory } from '../../../src/agent/graph/GraphMemory';
import { DevForgeConfig, Framework, PackageManager, DeploymentTarget, BranchStrategy } from '../../../src/types';
import { DevForgeFS } from '../../../src/utils/fs';

describe('devForgeGraph integration', () => {
  let tempDir: string;
  let fsAdapter: DevForgeFS;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-master-graph-'));
    fsAdapter = new DevForgeFS(tempDir);
    await fsAdapter.ensureDir('.github/workflows');
    await fsAdapter.writeFile('.github/workflows/ci.yml', 'name: CI\n');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('runs diagnosis and security nodes then persists graph memory', async () => {
    const recommendationResult: AgentResult = {
      agentName: 'RecommendationAgent',
      success: true,
      messages: [],
      expectedOutputs: [],
      recommendations: [],
      warnings: [],
    };

    const securityResult: AgentResult = {
      agentName: 'SecurityComplianceAgent',
      success: true,
      messages: [],
      expectedOutputs: [],
      recommendations: [],
      warnings: [],
    };

    const state = await runDevForgeGraph(
      {
        config: buildConfig(tempDir),
        fs: fsAdapter,
        generatedFiles: ['.github/workflows/ci.yml'],
        credentials: {
          provider: 'openai',
          credentials: { OPENAI_API_KEY: 'test' },
          setupAt: new Date().toISOString(),
          version: 1,
        },
        failureSignals: [
          {
            type: 'missing_script',
            severity: 'warning',
            message: 'missing build',
            affectedFile: 'package.json',
          },
        ],
        skipReport: true,
      },
      {
        dependencies: {
          createRecommendationAgent: () => ({ run: async () => recommendationResult }),
          createSecurityAgent: () => ({ run: async () => securityResult }),
        },
      },
    );

    expect(state.phase).toBe('complete');
    expect(state.recommendationResult).toEqual(recommendationResult);
    expect(state.securityResult).toEqual(securityResult);

    const memory = new GraphMemory(fsAdapter, tempDir);
    const record = await memory.loadLastRun();
    expect(record).not.toBeNull();
    expect(record?.phase).toBe('complete');
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
