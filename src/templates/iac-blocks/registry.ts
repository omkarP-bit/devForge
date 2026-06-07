import { DeploymentTarget, IaCGenerationOutput } from '../../types';
import { ECR_REPO_BLOCK } from './terraform/ecr-repo.tf';
import { ECS_CLUSTER_BLOCK } from './terraform/ecs-cluster.tf';
import { ECS_TASK_DEF_BLOCK } from './terraform/ecs-task-def.tf';
import { VARIABLES_BLOCK } from './terraform/variables.tf';
import { OUTPUTS_BLOCK } from './terraform/outputs.tf';
import { PROVIDER_BLOCK } from './terraform/provider.tf';
import { ECR_CDK_STACK } from './cdk/ecr-stack.tpl';
import { ECS_CDK_STACK } from './cdk/ecs-stack.tpl';
import { ECR_CREATE_BOTO3 } from './boto3/ecr-create.tpl';
import { ECS_DEPLOY_BOTO3 } from './boto3/ecs-deploy.tpl';

export type IaCToolChoice = 'terraform' | 'cdk' | 'boto3';

export interface IaCBlock {
  relativePath: string;
  content: string;
  description: string;
}

export interface SubstitutionVars {
  PROJECT_NAME: string;
  REPO_NAME: string;
  CLUSTER_NAME: string;
  ENVIRONMENT: string;
  AWS_REGION: string;
  IMAGE_TAG: string;
}

type RegistryKey = `${DeploymentTarget}::${IaCToolChoice}`;

type BlockBuilder = (vars: SubstitutionVars) => IaCBlock[];

const REGISTRY: Partial<Record<RegistryKey, BlockBuilder>> = {
  [`${DeploymentTarget.AWS_ECS}::terraform`]: (vars) => [
    {
      relativePath: 'infra/provider.tf',
      content: applyVars(PROVIDER_BLOCK, vars),
      description: 'Terraform provider and version constraints',
    },
    {
      relativePath: 'infra/variables.tf',
      content: applyVars(VARIABLES_BLOCK, vars),
      description: 'Input variables: region, project_name, environment, image_tag',
    },
    {
      relativePath: 'infra/main.tf',
      content: applyVars(ECR_REPO_BLOCK + '\n' + ECS_CLUSTER_BLOCK + '\n' + ECS_TASK_DEF_BLOCK, vars),
      description: 'ECR repository, ECS Fargate cluster, and task definition',
    },
    {
      relativePath: 'infra/outputs.tf',
      content: applyVars(OUTPUTS_BLOCK, vars),
      description: 'Output values: ECR URL, ECS cluster ARN',
    },
  ],

  [`${DeploymentTarget.AWS_EKS}::terraform`]: (vars) => [
    {
      relativePath: 'infra/provider.tf',
      content: applyVars(PROVIDER_BLOCK, vars),
      description: 'Terraform provider and version constraints',
    },
    {
      relativePath: 'infra/variables.tf',
      content: applyVars(VARIABLES_BLOCK, vars),
      description: 'Input variables',
    },
    {
      relativePath: 'infra/main.tf',
      content: applyVars(ECR_REPO_BLOCK, vars),
      description: 'ECR repository for EKS deployments',
    },
    {
      relativePath: 'infra/outputs.tf',
      content: applyVars(OUTPUTS_BLOCK, vars),
      description: 'Output values',
    },
  ],

  [`${DeploymentTarget.AWS_ECS}::cdk`]: (vars) => [
    {
      relativePath: 'infra/lib/ecr-stack.ts',
      content: applyVars(ECR_CDK_STACK, vars),
      description: 'CDK stack: ECR repository with lifecycle rules',
    },
    {
      relativePath: 'infra/lib/ecs-stack.ts',
      content: applyVars(ECS_CDK_STACK, vars),
      description: 'CDK stack: ECS Fargate cluster, task definition, ALB',
    },
    {
      relativePath: 'infra/bin/app.ts',
      content: applyVars(CDK_APP_ENTRY, vars),
      description: 'CDK app entry point',
    },
    {
      relativePath: 'infra/package.json',
      content: applyVars(CDK_PACKAGE_JSON, vars),
      description: 'CDK project package.json',
    },
  ],

  [`${DeploymentTarget.AWS_ECS}::boto3`]: (vars) => [
    {
      relativePath: 'scripts/ecr-create.py',
      content: applyVars(ECR_CREATE_BOTO3, vars),
      description: 'Create ECR repository with lifecycle policy',
    },
    {
      relativePath: 'scripts/deploy.py',
      content: applyVars(ECS_DEPLOY_BOTO3, vars),
      description: 'Register task definition and update ECS service',
    },
  ],

  [`${DeploymentTarget.DOCKER}::terraform`]: (vars) => [
    {
      relativePath: 'infra/provider.tf',
      content: applyVars(PROVIDER_BLOCK, vars),
      description: 'Terraform provider',
    },
    {
      relativePath: 'infra/variables.tf',
      content: applyVars(VARIABLES_BLOCK, vars),
      description: 'Input variables',
    },
    {
      relativePath: 'infra/main.tf',
      content: applyVars(ECR_REPO_BLOCK, vars),
      description: 'ECR repository for Docker image storage',
    },
    {
      relativePath: 'infra/outputs.tf',
      content: applyVars(OUTPUTS_BLOCK, vars),
      description: 'Output values',
    },
  ],
};

const CDK_APP_ENTRY = `#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EcrStack } from '../lib/ecr-stack';
import { EcsStack } from '../lib/ecs-stack';

const app = new cdk.App();
const ecrStack = new EcrStack(app, '{{PROJECT_NAME}}EcrStack', {
  env: { region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1' },
});
new EcsStack(app, '{{PROJECT_NAME}}EcsStack', {
  repository: ecrStack.repository,
  env: { region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1' },
});
`;

const CDK_PACKAGE_JSON = `{
  "name": "{{PROJECT_NAME}}-infra",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "synth": "cdk synth",
    "deploy": "cdk deploy --all",
    "diff": "cdk diff"
  },
  "dependencies": {
    "aws-cdk-lib": "^2.100.0",
    "constructs": "^10.0.0",
    "source-map-support": "^0.5.21"
  },
  "devDependencies": {
    "aws-cdk": "^2.100.0",
    "@types/node": "^20.0.0",
    "typescript": "~5.4.0"
  }
}
`;

export function getIaCBlocks(
  target: DeploymentTarget,
  tool: IaCToolChoice,
  vars: SubstitutionVars,
): IaCBlock[] {
  const key: RegistryKey = `${target}::${tool}`;
  const builder = REGISTRY[key];
  if (!builder) {
    return getDefaultBlocks(tool, vars);
  }
  return builder(vars);
}

export function getInstallInstructions(tool: IaCToolChoice): string[] {
  switch (tool) {
    case 'terraform':
      return ['terraform init', 'terraform validate', 'terraform plan'];
    case 'cdk':
      return ['cd infra && npm install', 'npx cdk synth', 'npx cdk deploy --all'];
    case 'boto3':
      return ['pip install boto3', 'aws configure', 'python scripts/ecr-create.py'];
  }
}

export function supportsIaCGeneration(target: DeploymentTarget): boolean {
  const noIaCTargets = [
    DeploymentTarget.VERCEL,
    DeploymentTarget.RAILWAY,
    DeploymentTarget.RENDER,
    DeploymentTarget.FIREBASE,
  ];
  return !noIaCTargets.includes(target);
}

function getDefaultBlocks(tool: IaCToolChoice, vars: SubstitutionVars): IaCBlock[] {
  switch (tool) {
    case 'terraform':
      return [
        {
          relativePath: 'infra/provider.tf',
          content: applyVars(PROVIDER_BLOCK, vars),
          description: 'Terraform provider',
        },
        {
          relativePath: 'infra/variables.tf',
          content: applyVars(VARIABLES_BLOCK, vars),
          description: 'Input variables',
        },
        {
          relativePath: 'infra/main.tf',
          content: applyVars(ECR_REPO_BLOCK, vars),
          description: 'ECR repository',
        },
        {
          relativePath: 'infra/outputs.tf',
          content: applyVars(OUTPUTS_BLOCK, vars),
          description: 'Output values',
        },
      ];
    case 'cdk':
      return [
        {
          relativePath: 'infra/lib/ecr-stack.ts',
          content: applyVars(ECR_CDK_STACK, vars),
          description: 'CDK ECR stack',
        },
        {
          relativePath: 'infra/package.json',
          content: applyVars(CDK_PACKAGE_JSON, vars),
          description: 'CDK package.json',
        },
      ];
    case 'boto3':
      return [
        {
          relativePath: 'scripts/ecr-create.py',
          content: applyVars(ECR_CREATE_BOTO3, vars),
          description: 'ECR creation script',
        },
      ];
  }
}

function applyVars(template: string, vars: SubstitutionVars): string {
  return template
    .replace(/\{\{PROJECT_NAME\}\}/g, vars.PROJECT_NAME)
    .replace(/\{\{REPO_NAME\}\}/g, vars.REPO_NAME)
    .replace(/\{\{CLUSTER_NAME\}\}/g, vars.CLUSTER_NAME)
    .replace(/\{\{ENVIRONMENT\}\}/g, vars.ENVIRONMENT)
    .replace(/\{\{AWS_REGION\}\}/g, vars.AWS_REGION)
    .replace(/\{\{IMAGE_TAG\}\}/g, vars.IMAGE_TAG);
}

export function buildSubstitutionVars(
  projectName: string,
  environment = 'production',
  region = 'us-east-1',
): SubstitutionVars {
  const safe = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return {
    PROJECT_NAME: safe,
    REPO_NAME: safe,
    CLUSTER_NAME: `${safe}-cluster`,
    ENVIRONMENT: environment,
    AWS_REGION: region,
    IMAGE_TAG: 'latest',
  };
}

export function getIaCGenerationOutput(
  target: DeploymentTarget,
  tool: IaCToolChoice,
  vars: SubstitutionVars,
): IaCGenerationOutput {
  const blocks = getIaCBlocks(target, tool, vars);
  return {
    tool,
    files: blocks,
    installInstructions: getInstallInstructions(tool),
    notes: [
      'Review all generated files before applying.',
      'Ensure AWS credentials are configured (aws configure or environment variables).',
      ...(tool === 'terraform' ? ['Run terraform init before terraform plan/apply.'] : []),
      ...(tool === 'cdk' ? ['Run npm install in the infra/ directory before cdk synth.'] : []),
    ],
  };
}
