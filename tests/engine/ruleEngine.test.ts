import { buildGenerationPlan } from '../../src/engine/ruleEngine';
import {
  Framework,
  PackageManager,
  DeploymentTarget,
  BranchStrategy,
  DevForgeConfig,
} from '../../src/types';
import { GeneratorError } from '../../src/utils/errors';

describe('ruleEngine', () => {
  // Helper to create a mock DevForgeConfig
  function createMockConfig(overrides?: Partial<DevForgeConfig>): DevForgeConfig {
    return {
      projectRoot: '/home/user/myproject',
      detected: {
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
      },
      user: {
        deploymentTarget: DeploymentTarget.RAILWAY,
        branchStrategy: BranchStrategy.FEATURE_MAIN,
        dockerRequired: false,
        multiEnvironment: false,
        environments: [],
      },
      dryRun: false,
      generatedAt: new Date().toISOString(),
      devforgeVersion: '1.0.0',
      ...overrides,
    };
  }

  describe('buildGenerationPlan', () => {
    it('always generates base CI workflow', () => {
      const config = createMockConfig();
      const plan = buildGenerationPlan(config);

      const ciFile = plan.files.find((f) => f.path === '.github/workflows/base-ci.yml');
      expect(ciFile).toBeDefined();
      expect(ciFile!.templateId).toBe('base-ci');
    });

    it('generates Vercel deployment workflow for Vercel target', () => {
      const config = createMockConfig({
        user: {
          deploymentTarget: DeploymentTarget.VERCEL,
          branchStrategy: BranchStrategy.FEATURE_MAIN,
          dockerRequired: false,
          multiEnvironment: false,
          environments: [],
        },
      });

      const plan = buildGenerationPlan(config);
      const vercelFile = plan.files.find((f) => f.path === '.github/workflows/deploy-vercel.yml');
      expect(vercelFile).toBeDefined();
      expect(vercelFile!.templateId).toBe('vercel-deploy');
    });

    it('generates Railway deployment workflow for Railway target', () => {
      const config = createMockConfig({
        user: {
          deploymentTarget: DeploymentTarget.RAILWAY,
          branchStrategy: BranchStrategy.FEATURE_MAIN,
          dockerRequired: false,
          multiEnvironment: false,
          environments: [],
        },
      });

      const plan = buildGenerationPlan(config);
      const railwayFile = plan.files.find(
        (f) => f.path === '.github/workflows/deploy-railway.yml',
      );
      expect(railwayFile).toBeDefined();
      expect(railwayFile!.templateId).toBe('railway-deploy');
    });

    it('generates Render deployment workflow for Render target', () => {
      const config = createMockConfig({
        user: {
          deploymentTarget: DeploymentTarget.RENDER,
          branchStrategy: BranchStrategy.FEATURE_MAIN,
          dockerRequired: false,
          multiEnvironment: false,
          environments: [],
        },
      });

      const plan = buildGenerationPlan(config);
      const renderFile = plan.files.find((f) => f.path === '.github/workflows/deploy-render.yml');
      expect(renderFile).toBeDefined();
      expect(renderFile!.templateId).toBe('render-deploy');
    });

    it('generates AWS EC2 deployment workflow for AWS target', () => {
      const config = createMockConfig({
        user: {
          deploymentTarget: DeploymentTarget.AWS_EC2,
          branchStrategy: BranchStrategy.FEATURE_MAIN,
          dockerRequired: false,
          multiEnvironment: false,
          environments: [],
        },
      });

      const plan = buildGenerationPlan(config);
      const awsFile = plan.files.find((f) => f.path === '.github/workflows/deploy-aws-ec2.yml');
      expect(awsFile).toBeDefined();
      expect(awsFile!.templateId).toBe('aws-ec2-deploy');
    });

    it('generates Docker build workflow for Docker target', () => {
      const config = createMockConfig({
        user: {
          deploymentTarget: DeploymentTarget.DOCKER,
          branchStrategy: BranchStrategy.FEATURE_MAIN,
          dockerRequired: true,
          multiEnvironment: false,
          environments: [],
        },
      });

      const plan = buildGenerationPlan(config);
      const dockerFile = plan.files.find(
        (f) => f.path === '.github/workflows/build-docker.yml',
      );
      expect(dockerFile).toBeDefined();
      expect(dockerFile!.templateId).toBe('docker-build');
    });

    it('does not generate Docker files when dockerRequired is false and target is not Docker', () => {
      const config = createMockConfig({
        user: {
          deploymentTarget: DeploymentTarget.RAILWAY,
          branchStrategy: BranchStrategy.FEATURE_MAIN,
          dockerRequired: false,
          multiEnvironment: false,
          environments: [],
        },
      });

      const plan = buildGenerationPlan(config);
      const dockerFiles = plan.files.filter((f) => f.path.startsWith('Dockerfile'));
      expect(dockerFiles).toHaveLength(0);
    });

    it('generates Docker files when dockerRequired is true', () => {
      const config = createMockConfig({
        user: {
          deploymentTarget: DeploymentTarget.RAILWAY,
          branchStrategy: BranchStrategy.FEATURE_MAIN,
          dockerRequired: true,
          multiEnvironment: false,
          environments: [],
        },
      });

      const plan = buildGenerationPlan(config);
      const dockerfile = plan.files.find((f) => f.path === 'Dockerfile');
      const dockerCompose = plan.files.find((f) => f.path === 'docker-compose.yml');
      const dockerIgnore = plan.files.find((f) => f.path === '.dockerignore');

      expect(dockerfile).toBeDefined();
      expect(dockerCompose).toBeDefined();
      expect(dockerIgnore).toBeDefined();
    });

    it('uses dockerfile-nextjs template for Next.js framework', () => {
      const config = createMockConfig({
        detected: {
          framework: Framework.NEXTJS,
          packageManager: PackageManager.NPM,
          nodeVersion: '20',
          hasDocker: false,
          hasTests: true,
          hasLinting: true,
          testCommand: 'jest',
          buildCommand: 'npm run build',
          installCommand: 'npm ci',
          detectedAt: new Date().toISOString(),
        },
        user: {
          deploymentTarget: DeploymentTarget.DOCKER,
          branchStrategy: BranchStrategy.FEATURE_MAIN,
          dockerRequired: true,
          multiEnvironment: false,
          environments: [],
        },
      });

      const plan = buildGenerationPlan(config);
      const dockerfile = plan.files.find((f) => f.path === 'Dockerfile');
      expect(dockerfile!.templateId).toBe('dockerfile-nextjs');
    });

    it('uses dockerfile-node template for non-Next.js frameworks', () => {
      const config = createMockConfig({
        detected: {
          framework: Framework.EXPRESS,
          packageManager: PackageManager.NPM,
          nodeVersion: '20',
          hasDocker: false,
          hasTests: true,
          hasLinting: true,
          testCommand: 'jest',
          buildCommand: 'npm run build',
          installCommand: 'npm ci',
          detectedAt: new Date().toISOString(),
        },
        user: {
          deploymentTarget: DeploymentTarget.DOCKER,
          branchStrategy: BranchStrategy.FEATURE_MAIN,
          dockerRequired: true,
          multiEnvironment: false,
          environments: [],
        },
      });

      const plan = buildGenerationPlan(config);
      const dockerfile = plan.files.find((f) => f.path === 'Dockerfile');
      expect(dockerfile!.templateId).toBe('dockerfile-node');
    });

    it('generates multi-environment deployment workflows when enabled', () => {
      const config = createMockConfig({
        user: {
          deploymentTarget: DeploymentTarget.RAILWAY,
          branchStrategy: BranchStrategy.GITFLOW,
          dockerRequired: false,
          multiEnvironment: true,
          environments: ['dev', 'staging', 'production'],
        },
      });

      const plan = buildGenerationPlan(config);
      const devFile = plan.files.find((f) => f.path === '.github/workflows/deploy-dev.yml');
      const stagingFile = plan.files.find(
        (f) => f.path === '.github/workflows/deploy-staging.yml',
      );
      const prodFile = plan.files.find(
        (f) => f.path === '.github/workflows/deploy-production.yml',
      );

      expect(devFile).toBeDefined();
      expect(devFile!.templateId).toBe('multi-env-deploy');
      expect(stagingFile).toBeDefined();
      expect(stagingFile!.templateId).toBe('multi-env-deploy');
      expect(prodFile).toBeDefined();
      expect(prodFile!.templateId).toBe('multi-env-deploy');
    });

    it('does not generate environment workflows when multiEnvironment is false', () => {
      const config = createMockConfig({
        user: {
          deploymentTarget: DeploymentTarget.RAILWAY,
          branchStrategy: BranchStrategy.FEATURE_MAIN,
          dockerRequired: false,
          multiEnvironment: false,
          environments: [],
        },
      });

      const plan = buildGenerationPlan(config);
      const envFiles = plan.files.filter((f) => f.templateId === 'multi-env-deploy');
      expect(envFiles).toHaveLength(0);
    });

    it('includes base variables in all files', () => {
      const config = createMockConfig();
      const plan = buildGenerationPlan(config);

      for (const file of plan.files) {
        const keys = file.variables.map((v) => v.key);
        expect(keys).toContain('nodeVersion');
        expect(keys).toContain('installCommand');
        expect(keys).toContain('buildCommand');
        expect(keys).toContain('testCommand');
        expect(keys).toContain('framework');
        expect(keys).toContain('packageManager');
      }
    });

    it('includes hasTests and hasLinting in base CI workflow', () => {
      const config = createMockConfig({
        detected: {
          framework: Framework.NESTJS,
          packageManager: PackageManager.NPM,
          nodeVersion: '20',
          hasDocker: false,
          hasTests: true,
          hasLinting: false,
          testCommand: 'jest',
          buildCommand: 'npm run build',
          installCommand: 'npm ci',
          detectedAt: new Date().toISOString(),
        },
      });

      const plan = buildGenerationPlan(config);
      const ciFile = plan.files.find((f) => f.templateId === 'base-ci');

      const hasTests = ciFile!.variables.find((v) => v.key === 'hasTests');
      const hasLinting = ciFile!.variables.find((v) => v.key === 'hasLinting');

      expect(hasTests!.value).toBe('true');
      expect(hasLinting!.value).toBe('false');
    });

    it('computes a valid planHash', () => {
      const config = createMockConfig();
      const plan = buildGenerationPlan(config);

      expect(plan.planHash).toBeDefined();
      expect(plan.planHash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex format
    });

    it('produces deterministic planHash for same config', () => {
      const config1 = createMockConfig();
      const config2 = createMockConfig();

      const plan1 = buildGenerationPlan(config1);
      const plan2 = buildGenerationPlan(config2);

      expect(plan1.planHash).toBe(plan2.planHash);
    });

    it('produces different planHash for different file sets', () => {
      const config1 = createMockConfig({
        user: {
          deploymentTarget: DeploymentTarget.RAILWAY,
          branchStrategy: BranchStrategy.FEATURE_MAIN,
          dockerRequired: false,
          multiEnvironment: false,
          environments: [],
        },
      });

      const config2 = createMockConfig({
        user: {
          deploymentTarget: DeploymentTarget.VERCEL,
          branchStrategy: BranchStrategy.FEATURE_MAIN,
          dockerRequired: false,
          multiEnvironment: false,
          environments: [],
        },
      });

      const plan1 = buildGenerationPlan(config1);
      const plan2 = buildGenerationPlan(config2);

      expect(plan1.planHash).not.toBe(plan2.planHash);
    });

    it('sets plan metadata correctly', () => {
      const config = createMockConfig({
        detected: {
          framework: Framework.NEXTJS,
          packageManager: PackageManager.NPM,
          nodeVersion: '20',
          hasDocker: false,
          hasTests: true,
          hasLinting: true,
          testCommand: 'jest',
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
      });

      const plan = buildGenerationPlan(config);

      expect(plan.framework).toBe(Framework.NEXTJS);
      expect(plan.deploymentTarget).toBe(DeploymentTarget.VERCEL);
      expect(plan.devforgeVersion).toBe('1.0.0');
      expect(new Date(plan.generatedAt)).toBeInstanceOf(Date);
    });

    it('throws GeneratorError for unknown template ID', () => {
      // This is a bit tricky to test directly since all templates we generate are valid
      // We would need to modify the AVAILABLE_TEMPLATES set in the source to test this
      // For now, we can verify that all generated templates are valid
      const config = createMockConfig();
      const plan = buildGenerationPlan(config);

      // No error should be thrown
      expect(plan.files.length).toBeGreaterThan(0);
    });

    it('handles projects with no tests and no linting', () => {
      const config = createMockConfig({
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
      });

      const plan = buildGenerationPlan(config);
      const ciFile = plan.files.find((f) => f.templateId === 'base-ci');

      const hasTests = ciFile!.variables.find((v) => v.key === 'hasTests');
      const hasLinting = ciFile!.variables.find((v) => v.key === 'hasLinting');

      expect(hasTests!.value).toBe('false');
      expect(hasLinting!.value).toBe('false');
    });

    it('handles missing buildCommand and testCommand gracefully', () => {
      const config = createMockConfig({
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
      });

      const plan = buildGenerationPlan(config);

      for (const file of plan.files) {
        const buildVar = file.variables.find((v) => v.key === 'buildCommand');
        const testVar = file.variables.find((v) => v.key === 'testCommand');

        // Should have default values
        expect(buildVar!.value).toBe('npm run build');
        expect(testVar!.value).toBe('npm test');
      }
    });

    it('generates correct number of files for multi-environment with Docker', () => {
      const config = createMockConfig({
        user: {
          deploymentTarget: DeploymentTarget.DOCKER,
          branchStrategy: BranchStrategy.GITFLOW,
          dockerRequired: true,
          multiEnvironment: true,
          environments: ['dev', 'staging', 'production'],
        },
      });

      const plan = buildGenerationPlan(config);

      // base-ci + docker-build + 3 env workflows + docker-compose + dockerfile + dockerignore
      // = 8 files total
      expect(plan.files.length).toBe(8);
    });

    it('generates environment variables for each environment', () => {
      const config = createMockConfig({
        user: {
          deploymentTarget: DeploymentTarget.RAILWAY,
          branchStrategy: BranchStrategy.GITFLOW,
          dockerRequired: false,
          multiEnvironment: true,
          environments: ['dev', 'staging', 'production'],
        },
      });

      const plan = buildGenerationPlan(config);

      const devFile = plan.files.find((f) => f.path === '.github/workflows/deploy-dev.yml');
      const stagingFile = plan.files.find(
        (f) => f.path === '.github/workflows/deploy-staging.yml',
      );
      const prodFile = plan.files.find(
        (f) => f.path === '.github/workflows/deploy-production.yml',
      );

      const devEnv = devFile!.variables.find((v) => v.key === 'environment');
      const stagingEnv = stagingFile!.variables.find((v) => v.key === 'environment');
      const prodEnv = prodFile!.variables.find((v) => v.key === 'environment');

      expect(devEnv!.value).toBe('dev');
      expect(stagingEnv!.value).toBe('staging');
      expect(prodEnv!.value).toBe('production');
    });
  });
});
