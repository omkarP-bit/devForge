import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { AgentResult } from '../../../src/agent/types';
import { runPostInitGraph } from '../../../src/agent/graph/runPostInitGraph';
import { DevForgeConfig } from '../../../src/types';
import { DevForgeFS } from '../../../src/utils/fs';

function buildTestConfig(projectRoot: string): DevForgeConfig {
  return {
    projectRoot,
    detected: {
      framework: 'react' as DevForgeConfig['detected']['framework'],
      packageManager: 'npm' as DevForgeConfig['detected']['packageManager'],
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
      deploymentTarget: 'vercel' as DevForgeConfig['user']['deploymentTarget'],
      branchStrategy: 'feature_main' as DevForgeConfig['user']['branchStrategy'],
      dockerRequired: false,
      multiEnvironment: false,
      environments: [],
    },
    dryRun: false,
    generatedAt: new Date().toISOString(),
    devforgeVersion: '1.0.0',
  };
}

const recommendationResult: AgentResult = {
  agentName: 'RecommendationAgent',
  success: true,
  messages: [{ type: 'info', text: 'recommendations ready' }],
  expectedOutputs: ['build passes'],
  recommendations: [],
  warnings: [],
};

const securityResult: AgentResult = {
  agentName: 'SecurityComplianceAgent',
  success: true,
  messages: [{ type: 'info', text: 'security scan complete' }],
  expectedOutputs: [],
  recommendations: [],
  warnings: [],
};

describe('postInitGraph', () => {
  let tempDir: string;
  let fsAdapter: DevForgeFS;
  const recommendRun = jest.fn();
  const securityRun = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    recommendRun.mockResolvedValue(recommendationResult);
    securityRun.mockResolvedValue(securityResult);

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-graph-'));
    fsAdapter = new DevForgeFS(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('runs recommendation before security when graph is invoked', async () => {
    const callOrder: string[] = [];

    const state = await runPostInitGraph(
      {
        config: buildTestConfig(tempDir),
        fs: fsAdapter,
        generatedFiles: ['.github/workflows/ci.yml'],
        credentials: {
          provider: 'openai',
          credentials: { OPENAI_API_KEY: 'test-key' },
          setupAt: new Date().toISOString(),
          version: 1,
        },
        failureSignals: [
          {
            type: 'missing_script',
            severity: 'error',
            message: 'Missing test script',
            affectedFile: 'package.json',
          },
        ],
        lastRunJson: null,
      },
      {
        dependencies: {
          createProvider: () => ({
            name: 'openai',
            chat: async () => 'ok',
            isAvailable: async () => true,
          }),
          createRecommendationAgent: () => ({
            run: async () => {
              callOrder.push('recommend');
              return recommendationResult;
            },
          }),
          createSecurityAgent: () => ({
            run: async () => {
              callOrder.push('security');
              return securityResult;
            },
          }),
        },
      },
    );

    expect(callOrder).toEqual(['recommend', 'security']);
    expect(state.recommendationResult).toEqual(recommendationResult);
    expect(state.securityResult).toEqual(securityResult);
    expect(['complete', 'security']).toContain(state.phase);
  });

  it('skips agent nodes for offline credentials', async () => {
    const state = await runPostInitGraph(
      {
        config: buildTestConfig(tempDir),
        fs: fsAdapter,
        generatedFiles: ['.github/workflows/ci.yml'],
        credentials: {
          provider: 'offline',
          credentials: {},
          setupAt: new Date().toISOString(),
          version: 1,
        },
        failureSignals: [],
        lastRunJson: null,
      },
      {
        dependencies: {
          createRecommendationAgent: () => ({
            run: recommendRun,
          }),
          createSecurityAgent: () => ({
            run: securityRun,
          }),
        },
      },
    );

    expect(state.phase).toBe('skipped');
    expect(recommendRun).not.toHaveBeenCalled();
    expect(securityRun).not.toHaveBeenCalled();
  });

  it('skips agent nodes when noAgent is true', async () => {
    const state = await runPostInitGraph(
      {
        config: buildTestConfig(tempDir),
        fs: fsAdapter,
        generatedFiles: ['.github/workflows/ci.yml'],
        credentials: {
          provider: 'openai',
          credentials: { OPENAI_API_KEY: 'test-key' },
          setupAt: new Date().toISOString(),
          version: 1,
        },
        failureSignals: [],
        lastRunJson: null,
        noAgent: true,
      },
      {
        dependencies: {
          createRecommendationAgent: () => ({
            run: recommendRun,
          }),
          createSecurityAgent: () => ({
            run: securityRun,
          }),
        },
      },
    );

    expect(state.phase).toBe('skipped');
    expect(recommendRun).not.toHaveBeenCalled();
    expect(securityRun).not.toHaveBeenCalled();
  });
});
