import {
  getOfflineFallbackResult,
  isOfflineMode,
} from '../../src/agent/OfflineFallback';
import { StoredCredentials } from '../../src/agent/credentials/types';
import { AgentContext } from '../../src/agent/types';
import {
  BranchStrategy,
  DeploymentTarget,
  Framework,
  PackageManager,
} from '../../src/types';

function createContext(): AgentContext {
  return {
    config: {
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
    },
    generatedFiles: [],
    lastRunJson: null,
  };
}

describe('OfflineFallback', () => {
  it('isOfflineMode() returns true only for offline provider', () => {
    const offline: StoredCredentials = {
      provider: 'offline',
      credentials: {},
      setupAt: new Date().toISOString(),
      version: 1,
    };
    const online: StoredCredentials = {
      provider: 'openai',
      credentials: { OPENAI_API_KEY: 'key' },
      setupAt: new Date().toISOString(),
      version: 1,
    };

    expect(isOfflineMode(offline)).toBe(true);
    expect(isOfflineMode(online)).toBe(false);
  });

  it('getOfflineFallbackResult() returns a static offline message', () => {
    const result = getOfflineFallbackResult('recommendation-agent', createContext());

    expect(result.success).toBe(true);
    expect(result.agentName).toBe('recommendation-agent');
    expect(result.messages[0]?.text).toContain('offline mode');
    expect(result.recommendations).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
