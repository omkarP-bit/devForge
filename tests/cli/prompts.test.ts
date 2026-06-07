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

  // Helper: standard 5-answer sequence (no multi-env, no IaC prompt needed for Vercel/Railway)
  function mockBasicPrompts(
    target: DeploymentTarget = DeploymentTarget.RAILWAY,
    branch: BranchStrategy = BranchStrategy.FEATURE_MAIN,
    docker = true,
    trivy = false,
  ) {
    mockedInquirer.prompt
      .mockResolvedValueOnce({ deploymentTarget: target })
      .mockResolvedValueOnce({ branchStrategy: branch })
      .mockResolvedValueOnce({ dockerRequired: docker })
      .mockResolvedValueOnce({ multiEnvironment: false })
      .mockResolvedValueOnce({ enableTrivyScan: trivy });
  }

  describe('collectUserConfig', () => {
    it('collects basic user config with default values', async () => {
      mockBasicPrompts();
      const config = await collectUserConfig(createMockDetected());

      expect(config.deploymentTarget).toBe(DeploymentTarget.RAILWAY);
      expect(config.branchStrategy).toBe(BranchStrategy.FEATURE_MAIN);
      expect(config.dockerRequired).toBe(true);
      expect(config.multiEnvironment).toBe(false);
      expect(config.environments).toEqual([]);
    });

    it('collects multi-environment config with environment names', async () => {
      mockedInquirer.prompt
        .mockResolvedValueOnce({ deploymentTarget: DeploymentTarget.VERCEL })
        .mockResolvedValueOnce({ branchStrategy: BranchStrategy.GITFLOW })
        .mockResolvedValueOnce({ dockerRequired: false })
        .mockResolvedValueOnce({ multiEnvironment: true })
        .mockResolvedValueOnce({ enableTrivyScan: false })
        .mockResolvedValueOnce({ environments: 'dev, staging, production' });

      const config = await collectUserConfig(createMockDetected());

      expect(config.multiEnvironment).toBe(true);
      expect(config.environments).toEqual(['dev', 'staging', 'production']);
    });

    it('sanitizes environment names by removing control characters and trimming', async () => {
      mockedInquirer.prompt
        .mockResolvedValueOnce({ deploymentTarget: DeploymentTarget.DOCKER })
        .mockResolvedValueOnce({ branchStrategy: BranchStrategy.SINGLE })
        .mockResolvedValueOnce({ dockerRequired: false })
        .mockResolvedValueOnce({ multiEnvironment: true })
        .mockResolvedValueOnce({ enableTrivyScan: false })
        .mockResolvedValueOnce({ environments: '  dev  ,  \u001b[31mstaging\u001b[0m  ,  production  ' });

      const config = await collectUserConfig(createMockDetected());

      expect(config.environments).toEqual(['dev', 'staging', 'production']);
    });

    it('throws ValidationError if environment names exceed max length', async () => {
      mockedInquirer.prompt
        .mockResolvedValueOnce({ deploymentTarget: DeploymentTarget.DOCKER })
        .mockResolvedValueOnce({ branchStrategy: BranchStrategy.SINGLE })
        .mockResolvedValueOnce({ dockerRequired: false })
        .mockResolvedValueOnce({ multiEnvironment: true })
        .mockResolvedValueOnce({ enableTrivyScan: false })
        .mockResolvedValueOnce({ environments: 'dev,' + 'a'.repeat(60) + ',prod' });

      await expect(collectUserConfig(createMockDetected())).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError if no valid environment names are provided', async () => {
      mockedInquirer.prompt
        .mockResolvedValueOnce({ deploymentTarget: DeploymentTarget.DOCKER })
        .mockResolvedValueOnce({ branchStrategy: BranchStrategy.SINGLE })
        .mockResolvedValueOnce({ dockerRequired: false })
        .mockResolvedValueOnce({ multiEnvironment: true })
        .mockResolvedValueOnce({ enableTrivyScan: false })
        .mockResolvedValueOnce({ environments: '   ,   ,   ' });

      await expect(collectUserConfig(createMockDetected())).rejects.toThrow(ValidationError);
    });

    it('defaults to Vercel for Next.js projects', async () => {
      mockBasicPrompts(DeploymentTarget.VERCEL, BranchStrategy.FEATURE_MAIN, false);
      const config = await collectUserConfig(createMockDetected({ framework: Framework.NEXTJS }));
      expect(config.deploymentTarget).toBe(DeploymentTarget.VERCEL);
    });

    it('defaults to Railway for Express projects', async () => {
      mockBasicPrompts(DeploymentTarget.RAILWAY, BranchStrategy.FEATURE_MAIN, false);
      const config = await collectUserConfig(createMockDetected({ framework: Framework.EXPRESS }));
      expect(config.deploymentTarget).toBe(DeploymentTarget.RAILWAY);
    });

    it('defaults to Docker for unknown frameworks', async () => {
      mockBasicPrompts(DeploymentTarget.DOCKER, BranchStrategy.FEATURE_MAIN, false);
      const config = await collectUserConfig(createMockDetected({ framework: Framework.UNKNOWN }));
      expect(config.deploymentTarget).toBe(DeploymentTarget.DOCKER);
    });

    it('validates all deployment target enum values', async () => {
      for (const target of Object.values(DeploymentTarget)) {
        jest.clearAllMocks();
        mockBasicPrompts(target, BranchStrategy.FEATURE_MAIN, false);
        const config = await collectUserConfig(createMockDetected());
        expect(config.deploymentTarget).toBe(target);
      }
    });

    it('validates all branch strategy enum values', async () => {
      for (const strategy of Object.values(BranchStrategy)) {
        jest.clearAllMocks();
        mockBasicPrompts(DeploymentTarget.DOCKER, strategy, false);
        const config = await collectUserConfig(createMockDetected());
        expect(config.branchStrategy).toBe(strategy);
      }
    });

    it('respects multiEnvironment false and returns empty environments array', async () => {
      mockBasicPrompts(DeploymentTarget.DOCKER, BranchStrategy.FEATURE_MAIN, true);
      const config = await collectUserConfig(createMockDetected());
      expect(config.multiEnvironment).toBe(false);
      expect(config.environments).toEqual([]);
    });

    it('handles Docker detection default when hasDocker is true', async () => {
      mockBasicPrompts(DeploymentTarget.DOCKER, BranchStrategy.FEATURE_MAIN, true);
      const config = await collectUserConfig(createMockDetected({ hasDocker: true }));
      expect(config.dockerRequired).toBe(true);
    });

    it('validates config with Zod schema', async () => {
      mockedInquirer.prompt
        .mockResolvedValueOnce({ deploymentTarget: DeploymentTarget.VERCEL })
        .mockResolvedValueOnce({ branchStrategy: BranchStrategy.GITFLOW })
        .mockResolvedValueOnce({ dockerRequired: false })
        .mockResolvedValueOnce({ multiEnvironment: true })
        .mockResolvedValueOnce({ enableTrivyScan: false })
        .mockResolvedValueOnce({ environments: 'development, staging, production' });

      const config = await collectUserConfig(createMockDetected());

      expect(config).toHaveProperty('deploymentTarget');
      expect(config).toHaveProperty('branchStrategy');
      expect(config).toHaveProperty('dockerRequired');
      expect(config).toHaveProperty('multiEnvironment');
      expect(config).toHaveProperty('environments');
    });

    it('handles single environment name', async () => {
      mockedInquirer.prompt
        .mockResolvedValueOnce({ deploymentTarget: DeploymentTarget.DOCKER })
        .mockResolvedValueOnce({ branchStrategy: BranchStrategy.SINGLE })
        .mockResolvedValueOnce({ dockerRequired: false })
        .mockResolvedValueOnce({ multiEnvironment: true })
        .mockResolvedValueOnce({ enableTrivyScan: false })
        .mockResolvedValueOnce({ environments: 'production' });

      const config = await collectUserConfig(createMockDetected());
      expect(config.environments).toEqual(['production']);
    });

    it('handles many environment names', async () => {
      mockedInquirer.prompt
        .mockResolvedValueOnce({ deploymentTarget: DeploymentTarget.DOCKER })
        .mockResolvedValueOnce({ branchStrategy: BranchStrategy.GITFLOW })
        .mockResolvedValueOnce({ dockerRequired: false })
        .mockResolvedValueOnce({ multiEnvironment: true })
        .mockResolvedValueOnce({ enableTrivyScan: false })
        .mockResolvedValueOnce({ environments: 'dev1,dev2,staging1,staging2,production,qa,uat' });

      const config = await collectUserConfig(createMockDetected());
      expect(config.environments).toEqual(['dev1', 'dev2', 'staging1', 'staging2', 'production', 'qa', 'uat']);
    });
  });
});
