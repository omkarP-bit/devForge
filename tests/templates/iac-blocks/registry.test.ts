import {
  getIaCBlocks,
  getInstallInstructions,
  buildSubstitutionVars,
  supportsIaCGeneration,
  getIaCGenerationOutput,
  IaCToolChoice,
} from '../../../src/templates/iac-blocks/registry';
import { DeploymentTarget } from '../../../src/types';

describe('IaC Block Registry', () => {
  const vars = buildSubstitutionVars('my-app');

  describe('buildSubstitutionVars()', () => {
    it('generates safe lowercase names', () => {
      const v = buildSubstitutionVars('My App!!');
      expect(v.PROJECT_NAME).toMatch(/^[a-z0-9-]+$/);
      expect(v.CLUSTER_NAME).toContain('-cluster');
    });

    it('uses defaults for environment and region', () => {
      expect(vars.ENVIRONMENT).toBe('production');
      expect(vars.AWS_REGION).toBe('us-east-1');
      expect(vars.IMAGE_TAG).toBe('latest');
    });

    it('accepts custom environment and region', () => {
      const v = buildSubstitutionVars('app', 'staging', 'eu-west-1');
      expect(v.ENVIRONMENT).toBe('staging');
      expect(v.AWS_REGION).toBe('eu-west-1');
    });
  });

  describe('supportsIaCGeneration()', () => {
    it.each([
      [DeploymentTarget.VERCEL, false],
      [DeploymentTarget.RAILWAY, false],
      [DeploymentTarget.RENDER, false],
      [DeploymentTarget.FIREBASE, false],
      [DeploymentTarget.AWS_ECS, true],
      [DeploymentTarget.AWS_EKS, true],
      [DeploymentTarget.DOCKER, true],
      [DeploymentTarget.AWS_EC2, true],
    ])('%s → %s', (target, expected) => {
      expect(supportsIaCGeneration(target)).toBe(expected);
    });
  });

  describe('getIaCBlocks() – terraform', () => {
    it('AWS_ECS + terraform returns provider, variables, main, outputs', () => {
      const blocks = getIaCBlocks(DeploymentTarget.AWS_ECS, 'terraform', vars);
      const paths = blocks.map((b) => b.relativePath);
      expect(paths).toContain('infra/provider.tf');
      expect(paths).toContain('infra/variables.tf');
      expect(paths).toContain('infra/main.tf');
      expect(paths).toContain('infra/outputs.tf');
    });

    it('AWS_EKS + terraform returns at least main and variables', () => {
      const blocks = getIaCBlocks(DeploymentTarget.AWS_EKS, 'terraform', vars);
      const paths = blocks.map((b) => b.relativePath);
      expect(paths).toContain('infra/main.tf');
      expect(paths).toContain('infra/variables.tf');
    });

    it('DOCKER + terraform returns ECR repo block in main.tf', () => {
      const blocks = getIaCBlocks(DeploymentTarget.DOCKER, 'terraform', vars);
      const main = blocks.find((b) => b.relativePath === 'infra/main.tf');
      expect(main?.content).toContain('aws_ecr_repository');
    });

    it('no leftover {{}} placeholders after variable substitution', () => {
      const blocks = getIaCBlocks(DeploymentTarget.AWS_ECS, 'terraform', vars);
      for (const block of blocks) {
        expect(block.content).not.toMatch(/\{\{[A-Z_]+\}\}/);
      }
    });

    it('each block has a non-empty description', () => {
      const blocks = getIaCBlocks(DeploymentTarget.AWS_ECS, 'terraform', vars);
      for (const block of blocks) {
        expect(block.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getIaCBlocks() – cdk', () => {
    it('AWS_ECS + cdk returns ecr-stack, ecs-stack, app entry, package.json', () => {
      const blocks = getIaCBlocks(DeploymentTarget.AWS_ECS, 'cdk', vars);
      const paths = blocks.map((b) => b.relativePath);
      expect(paths).toContain('infra/lib/ecr-stack.ts');
      expect(paths).toContain('infra/lib/ecs-stack.ts');
      expect(paths).toContain('infra/bin/app.ts');
      expect(paths).toContain('infra/package.json');
    });

    it('no leftover {{}} placeholders in CDK blocks', () => {
      const blocks = getIaCBlocks(DeploymentTarget.AWS_ECS, 'cdk', vars);
      for (const block of blocks) {
        expect(block.content).not.toMatch(/\{\{[A-Z_]+\}\}/);
      }
    });

    it('package.json contains aws-cdk-lib dependency', () => {
      const blocks = getIaCBlocks(DeploymentTarget.AWS_ECS, 'cdk', vars);
      const pkg = blocks.find((b) => b.relativePath === 'infra/package.json');
      expect(pkg?.content).toContain('aws-cdk-lib');
    });
  });

  describe('getIaCBlocks() – boto3', () => {
    it('AWS_ECS + boto3 returns ecr-create.py and deploy.py', () => {
      const blocks = getIaCBlocks(DeploymentTarget.AWS_ECS, 'boto3', vars);
      const paths = blocks.map((b) => b.relativePath);
      expect(paths).toContain('scripts/ecr-create.py');
      expect(paths).toContain('scripts/deploy.py');
    });

    it('no leftover {{}} placeholders in boto3 blocks', () => {
      const blocks = getIaCBlocks(DeploymentTarget.AWS_ECS, 'boto3', vars);
      for (const block of blocks) {
        expect(block.content).not.toMatch(/\{\{[A-Z_]+\}\}/);
      }
    });

    it('deploy.py contains boto3 import', () => {
      const blocks = getIaCBlocks(DeploymentTarget.AWS_ECS, 'boto3', vars);
      const deploy = blocks.find((b) => b.relativePath === 'scripts/deploy.py');
      expect(deploy?.content).toContain('import boto3');
    });
  });

  describe('getIaCBlocks() – unregistered target falls back to default', () => {
    it('returns default terraform blocks for AWS_EC2', () => {
      const blocks = getIaCBlocks(DeploymentTarget.AWS_EC2, 'terraform', vars);
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks.some((b) => b.relativePath.endsWith('.tf'))).toBe(true);
    });

    it('returns default cdk blocks for AWS_EC2', () => {
      const blocks = getIaCBlocks(DeploymentTarget.AWS_EC2, 'cdk', vars);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('returns default boto3 blocks for AWS_EC2', () => {
      const blocks = getIaCBlocks(DeploymentTarget.AWS_EC2, 'boto3', vars);
      expect(blocks.length).toBeGreaterThan(0);
    });
  });

  describe('getInstallInstructions()', () => {
    it.each<[IaCToolChoice, string[]]>([
      ['terraform', ['terraform init', 'terraform validate', 'terraform plan']],
      ['cdk', ['cd infra && npm install', 'npx cdk synth', 'npx cdk deploy --all']],
      ['boto3', ['pip install boto3', 'aws configure', 'python scripts/ecr-create.py']],
    ])('%s returns expected instructions', (tool, expected) => {
      expect(getInstallInstructions(tool)).toEqual(expected);
    });
  });

  describe('getIaCGenerationOutput()', () => {
    it('returns complete IaCGenerationOutput with files, instructions, and notes', () => {
      const output = getIaCGenerationOutput(DeploymentTarget.AWS_ECS, 'terraform', vars);
      expect(output.tool).toBe('terraform');
      expect(output.files.length).toBeGreaterThan(0);
      expect(output.installInstructions.length).toBeGreaterThan(0);
      expect(output.notes.some((n) => /review/i.test(n))).toBe(true);
    });

    it('includes terraform init note for terraform tool', () => {
      const output = getIaCGenerationOutput(DeploymentTarget.AWS_ECS, 'terraform', vars);
      expect(output.notes.some((n) => /terraform init/i.test(n))).toBe(true);
    });

    it('includes npm install note for cdk tool', () => {
      const output = getIaCGenerationOutput(DeploymentTarget.AWS_ECS, 'cdk', vars);
      expect(output.notes.some((n) => /npm install/i.test(n))).toBe(true);
    });
  });
});
