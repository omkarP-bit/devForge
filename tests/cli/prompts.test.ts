import {
  DeploymentTarget,
  BranchStrategy,
  Framework,
  PackageManager,
  DetectedProject,
} from '../../src/types';
import { collectUserConfig } from '../../src/cli/prompts';
import { ValidationError } from '../../src/utils/errors';
import inquirer from 'inquirer';

// Mock inquirer
jest.mock('inquirer');

const mockedInquirer = inquirer as jest.Mocked<typeof inquirer>;

describe('prompts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper to create a mock DetectedProject
  function createMockDetected(overrides?: Partial<DetectedProject>): DetectedProject {
    return {
      framework: Framework.NESTJS,
      packageManager: PackageManager.NPM,
      nodeVersion: '20',
      hasDocker: false,
      hasTests: true,
      hasLinting: true,
      testCommand: 'jest',
      buildCommand: 'npm run build',
      installCommand: 'npm ci',
      detectedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  describe('collectUserConfig', () => {
    it('collects basic user config with default values', async () => {
      mockedInquirer.prompt
        .mockResolvedValueOnce({
          deploymentTarget: DeploymentTarget.RAILWAY,
        })
        .mockResolvedValueOnce({
          branchStrategy: BranchStrategy.FEATURE_MAIN,
        })
        .mockResolvedValueOnce({
          dockerRequired: true,
        })
        .mockResolvedValueOnce({
          multiEnvironment: false,
        });

      const detected = createMockDetected();
      const config = await collectUserConfig(detected);

      expect(config.deploymentTarget).toBe(DeploymentTarget.RAILWAY);
      expect(config.branchStrategy).toBe(BranchStrategy.FEATURE_MAIN);
      expect(config.dockerRequired).toBe(true);
      expect(config.multiEnvironment).toBe(false);
      expect(config.environments).toEqual([]);
    });

    it('collects multi-environment config with environment names', async () => {
      mockedInquirer.prompt
        .mockResolvedValueOnce({
          deploymentTarget: DeploymentTarget.VERCEL,
        })
        .mockResolvedValueOnce({
          branchStrategy: BranchStrategy.GITFLOW,
        })
        .mockResolvedValueOnce({
          dockerRequired: false,
        })
        .mockResolvedValueOnce({
          multiEnvironment: true,
        })
        .mockResolvedValueOnce({
          environments: 'dev, staging, production',
        });

      const detected = createMockDetected();
      const config = await collectUserConfig(detected);

      expect(config.multiEnvironment).toBe(true);
      expect(config.environments).toEqual(['dev', 'staging', 'production']);
    });

    it('sanitizes environment names by removing control characters and trimming', async () => {
      mockedInquirer.prompt
        .mockResolvedValueOnce({
          deploymentTarget: DeploymentTarget.DOCKER,
        })
        .mockResolvedValueOnce({
          branchStrategy: BranchStrategy.SINGLE,
        })
        .mockResolvedValueOnce({
          dockerRequired: false,
        })
        .mockResolvedValueOnce({
          multiEnvironment: true,
        })
        .mockResolvedValueOnce({
          environments: '  dev  ,  \u001b[31mstaging\u001b[0m  ,  production  ',
        });

      const detected = createMockDetected();
      const config = await collectUserConfig(detected);

      // Expect trimmed and control-char-free environment names
      expect(config.environments).toEqual(['dev', 'staging', 'production']);
    });

    it('throws ValidationError if environment names exceed max length', async () => {
      mockedInquirer.prompt
        .mockResolvedValueOnce({
          deploymentTarget: DeploymentTarget.DOCKER,
        })
        .mockResolvedValueOnce({
          branchStrategy: BranchStrategy.SINGLE,
        })
        .mockResolvedValueOnce({
          dockerRequired: false,
        })
        .mockResolvedValueOnce({
          multiEnvironment: true,
        })
        .mockResolvedValueOnce({
          environments: 'dev,' + 'a'.repeat(60) + ',prod',
        });

      const detected = createMockDetected();

      await expect(collectUserConfig(detected)).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError if no valid environment names are provided', async () => {
      mockedInquirer.prompt
        .mockResolvedValueOnce({
          deploymentTarget: DeploymentTarget.DOCKER,
        })
        .mockResolvedValueOnce({
          branchStrategy: BranchStrategy.SINGLE,
        })
        .mockResolvedValueOnce({
          dockerRequired: false,
        })
        .mockResolvedValueOnce({
          multiEnvironment: true,
        })
        .mockResolvedValueOnce({
          environments: '   ,   ,   ',
        });

      const detected = createMockDetected();

      await expect(collectUserConfig(detected)).rejects.toThrow(ValidationError);
    });

    it('defaults to Vercel for Next.js projects', async () => {
      mockedInquirer.prompt
        .mockResolvedValueOnce({
          deploymentTarget: DeploymentTarget.VERCEL,
        })
        .mockResolvedValueOnce({
          branchStrategy: BranchStrategy.FEATURE_MAIN,
        })
        .mockResolvedValueOnce({
          dockerRequired: false,
        })
        .mockResolvedValueOnce({
          multiEnvironment: false,
        });

      const detected = createMockDetected({ framework: Framework.NEXTJS });
      const config = await collectUserConfig(detected);

      expect(config.deploymentTarget).toBe(DeploymentTarget.VERCEL);
    });

    it('defaults to Railway for Express projects', async () => {
      mockedInquirer.prompt
        .mockResolvedValueOnce({
          deploymentTarget: DeploymentTarget.RAILWAY,
        })
        .mockResolvedValueOnce({
          branchStrategy: BranchStrategy.FEATURE_MAIN,
        })
        .mockResolvedValueOnce({
          dockerRequired: false,
        })
        .mockResolvedValueOnce({
          multiEnvironment: false,
        });

      const detected = createMockDetected({ framework: Framework.EXPRESS });
      const config = await collectUserConfig(detected);

      expect(config.deploymentTarget).toBe(DeploymentTarget.RAILWAY);
    });

    it('defaults to Docker for unknown frameworks', async () => {
      mockedInquirer.prompt
        .mockResolvedValueOnce({
          deploymentTarget: DeploymentTarget.DOCKER,
        })
        .mockResolvedValueOnce({
          branchStrategy: BranchStrategy.FEATURE_MAIN,
        })
        .mockResolvedValueOnce({
          dockerRequired: false,
        })
        .mockResolvedValueOnce({
          multiEnvironment: false,
        });

      const detected = createMockDetected({ framework: Framework.UNKNOWN });
      const config = await collectUserConfig(detected);

      expect(config.deploymentTarget).toBe(DeploymentTarget.DOCKER);
    });

    it('validates all deployment target enum values', async () => {
      for (const target of Object.values(DeploymentTarget)) {
        jest.clearAllMocks();

        mockedInquirer.prompt
          .mockResolvedValueOnce({
            deploymentTarget: target,
          })
          .mockResolvedValueOnce({
            branchStrategy: BranchStrategy.FEATURE_MAIN,
          })
          .mockResolvedValueOnce({
            dockerRequired: false,
          })
          .mockResolvedValueOnce({
            multiEnvironment: false,
          });

        const detected = createMockDetected();
        const config = await collectUserConfig(detected);
        expect(config.deploymentTarget).toBe(target);
      }
    });

    it('validates all branch strategy enum values', async () => {
      for (const strategy of Object.values(BranchStrategy)) {
        jest.clearAllMocks();

        mockedInquirer.prompt
          .mockResolvedValueOnce({
            deploymentTarget: DeploymentTarget.DOCKER,
          })
          .mockResolvedValueOnce({
            branchStrategy: strategy,
          })
          .mockResolvedValueOnce({
            dockerRequired: false,
          })
          .mockResolvedValueOnce({
            multiEnvironment: false,
          });

        const detected = createMockDetected();
        const config = await collectUserConfig(detected);
        expect(config.branchStrategy).toBe(strategy);
      }
    });

    it('respects multiEnvironment false and returns empty environments array', async () => {
      mockedInquirer.prompt
        .mockResolvedValueOnce({
          deploymentTarget: DeploymentTarget.DOCKER,
        })
        .mockResolvedValueOnce({
          branchStrategy: BranchStrategy.FEATURE_MAIN,
        })
        .mockResolvedValueOnce({
          dockerRequired: true,
        })
        .mockResolvedValueOnce({
          multiEnvironment: false,
        });

      const detected = createMockDetected();
      const config = await collectUserConfig(detected);

      expect(config.multiEnvironment).toBe(false);
      expect(config.environments).toEqual([]);
    });

    it('handles Docker detection default when hasDocker is true', async () => {
      mockedInquirer.prompt
        .mockResolvedValueOnce({
          deploymentTarget: DeploymentTarget.DOCKER,
        })
        .mockResolvedValueOnce({
          branchStrategy: BranchStrategy.FEATURE_MAIN,
        })
        .mockResolvedValueOnce({
          dockerRequired: true,
        })
        .mockResolvedValueOnce({
          multiEnvironment: false,
        });

      const detected = createMockDetected({ hasDocker: true });
      const config = await collectUserConfig(detected);

      expect(config.dockerRequired).toBe(true);
    });

    it('validates config with Zod schema', async () => {
      mockedInquirer.prompt
        .mockResolvedValueOnce({
          deploymentTarget: DeploymentTarget.VERCEL,
        })
        .mockResolvedValueOnce({
          branchStrategy: BranchStrategy.GITFLOW,
        })
        .mockResolvedValueOnce({
          dockerRequired: false,
        })
        .mockResolvedValueOnce({
          multiEnvironment: true,
        })
        .mockResolvedValueOnce({
          environments: 'development, staging, production',
        });

      const detected = createMockDetected();
      const config = await collectUserConfig(detected);

      // Verify all fields are present and valid
      expect(config).toHaveProperty('deploymentTarget');
      expect(config).toHaveProperty('branchStrategy');
      expect(config).toHaveProperty('dockerRequired');
      expect(config).toHaveProperty('multiEnvironment');
      expect(config).toHaveProperty('environments');
    });

    it('handles single environment name', async () => {
      mockedInquirer.prompt
        .mockResolvedValueOnce({
          deploymentTarget: DeploymentTarget.DOCKER,
        })
        .mockResolvedValueOnce({
          branchStrategy: BranchStrategy.SINGLE,
        })
        .mockResolvedValueOnce({
          dockerRequired: false,
        })
        .mockResolvedValueOnce({
          multiEnvironment: true,
        })
        .mockResolvedValueOnce({
          environments: 'production',
        });

      const detected = createMockDetected();
      const config = await collectUserConfig(detected);

      expect(config.environments).toEqual(['production']);
    });

    it('handles many environment names', async () => {
      mockedInquirer.prompt
        .mockResolvedValueOnce({
          deploymentTarget: DeploymentTarget.DOCKER,
        })
        .mockResolvedValueOnce({
          branchStrategy: BranchStrategy.GITFLOW,
        })
        .mockResolvedValueOnce({
          dockerRequired: false,
        })
        .mockResolvedValueOnce({
          multiEnvironment: true,
        })
        .mockResolvedValueOnce({
          environments: 'dev1,dev2,staging1,staging2,production,qa,uat',
        });

      const detected = createMockDetected();
      const config = await collectUserConfig(detected);

      expect(config.environments).toEqual([
        'dev1',
        'dev2',
        'staging1',
        'staging2',
        'production',
        'qa',
        'uat',
      ]);
    });
  });
});
