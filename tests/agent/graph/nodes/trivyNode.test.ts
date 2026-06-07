import { trivyNode } from '../../../../src/agent/graph/nodes/trivyNode';
import { TrivyRunner } from '../../../../src/agent/security/TrivyRunner';
import { DevForgeGraphStateType } from '../../../../src/agent/graph/stateAnnotation';
import { Framework, PackageManager, DeploymentTarget, BranchStrategy } from '../../../../src/types';

jest.mock('../../../../src/agent/security/TrivyRunner');

const MockedRunner = TrivyRunner as jest.MockedClass<typeof TrivyRunner>;

const EMPTY_SCAN = { SchemaVersion: 2, ArtifactName: '', ArtifactType: 'filesystem' as const, Results: [] };

function makeState(projectRoot = '/tmp/proj'): DevForgeGraphStateType {
  return {
    context: {
      config: {
        projectRoot,
        detected: {
          framework: Framework.EXPRESS,
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
        devforgeVersion: '2.0.0',
      },
      generatedFiles: [],
      lastRunJson: null,
      failureSignals: [],
    },
    credentials: { provider: 'offline', credentials: {} },
    recommendationResult: null,
    securityResult: null,
    phase: 'idle',
    errors: [],
    metadata: { startedAt: new Date().toISOString(), graphVersion: 2 },
    noAgent: false,
    fixAttempts: 0,
    maxFixAttempts: 3,
    fixedFiles: [],
    violations: [],
    requiresApproval: false,
    approved: false,
    autoApprove: false,
    storedRecommendationIds: [],
    skipReport: false,
    verbose: false,
    nodeTimings: [],
    trivyViolations: [],
    trivySkipped: false,
    trivySummary: null,
  };
}

describe('trivyNode', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns trivySkipped:true when Trivy not available', async () => {
    MockedRunner.prototype.isAvailable = jest.fn().mockResolvedValue(false);
    const result = await trivyNode(makeState());
    expect(result.trivySkipped).toBe(true);
    expect(result.trivyViolations).toEqual([]);
  });

  it('returns violations when scans succeed', async () => {
    MockedRunner.prototype.isAvailable = jest.fn().mockResolvedValue(true);
    MockedRunner.prototype.scanFilesystem = jest.fn().mockResolvedValue(EMPTY_SCAN);
    MockedRunner.prototype.scanConfig = jest.fn().mockResolvedValue(EMPTY_SCAN);
    const result = await trivyNode(makeState());
    expect(result.trivySkipped).toBe(false);
    expect(result.trivyViolations).toEqual([]);
    expect(result.trivySummary).toBeDefined();
  });

  it('continues if filesystem scan throws', async () => {
    MockedRunner.prototype.isAvailable = jest.fn().mockResolvedValue(true);
    MockedRunner.prototype.scanFilesystem = jest.fn().mockRejectedValue(new Error('scan failed'));
    MockedRunner.prototype.scanConfig = jest.fn().mockResolvedValue(EMPTY_SCAN);
    const result = await trivyNode(makeState());
    expect(result.trivySkipped).toBe(false);
  });
});
