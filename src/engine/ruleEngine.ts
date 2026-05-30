import { createHash } from 'crypto';
import { DevForgeConfig, Framework, DeploymentTarget } from '../types';
import { GeneratorError } from '../utils/errors';

/**
 * Represents a template variable to be substituted during rendering.
 */
export interface TemplateVariable {
  key: string;
  value: string;
}

/**
 * Represents a file to be generated as part of the generation plan.
 */
export interface PlannedFile {
  path: string;
  templateId: string;
  variables: TemplateVariable[];
}

/**
 * Complete generation plan: all files to be generated with their templates and variables.
 */
export interface GenerationPlan {
  files: PlannedFile[];
  planHash: string;
  framework: Framework;
  deploymentTarget: DeploymentTarget;
  generatedAt: string;
  devforgeVersion: string;
}

/**
 * Registry of available templates.
 * Maps templateId to whether it's a valid template.
 */
const AVAILABLE_TEMPLATES = new Set<string>([
  'base-ci',
  'vercel-deploy',
  'railway-deploy',
  'render-deploy',
  'aws-ec2-deploy',
  'docker-build',
  'docker-compose',
  'dockerfile-node',
  'dockerfile-nextjs',
  'dockerignore',
  'multi-env-deploy',
]);

/**
 * Base variables that are common to all generation plans.
 */
function buildBaseVariables(config: DevForgeConfig): TemplateVariable[] {
  const detected = config.detected;
  return [
    { key: 'nodeVersion', value: detected.nodeVersion },
    { key: 'installCommand', value: detected.installCommand },
    { key: 'buildCommand', value: detected.buildCommand || 'npm run build' },
    { key: 'testCommand', value: detected.testCommand || 'npm test' },
    { key: 'framework', value: detected.framework },
    { key: 'packageManager', value: detected.packageManager },
  ];
}

/**
 * Determines which CI/CD workflow files should be generated based on the framework
 * and deployment target combination.
 */
function planWorkflowFiles(config: DevForgeConfig): PlannedFile[] {
  const files: PlannedFile[] = [];
  const baseVars = buildBaseVariables(config);
  const user = config.user;
  const detected = config.detected;

  // Always include base CI workflow
  files.push({
    path: '.github/workflows/base-ci.yml',
    templateId: 'base-ci',
    variables: [
      ...baseVars,
      { key: 'hasTests', value: detected.hasTests ? 'true' : 'false' },
      { key: 'hasLinting', value: detected.hasLinting ? 'true' : 'false' },
    ],
  });

  // Add deployment-specific workflows
  switch (user.deploymentTarget) {
    case DeploymentTarget.VERCEL:
      files.push({
        path: '.github/workflows/deploy-vercel.yml',
        templateId: 'vercel-deploy',
        variables: [...baseVars, { key: 'deploymentTarget', value: 'vercel' }],
      });
      break;

    case DeploymentTarget.RAILWAY:
      files.push({
        path: '.github/workflows/deploy-railway.yml',
        templateId: 'railway-deploy',
        variables: [...baseVars, { key: 'deploymentTarget', value: 'railway' }],
      });
      break;

    case DeploymentTarget.RENDER:
      files.push({
        path: '.github/workflows/deploy-render.yml',
        templateId: 'render-deploy',
        variables: [...baseVars, { key: 'deploymentTarget', value: 'render' }],
      });
      break;

    case DeploymentTarget.FIREBASE:
      // Firebase uses npm CLI, so no separate template needed yet
      break;

    case DeploymentTarget.AWS_EC2:
      files.push({
        path: '.github/workflows/deploy-aws-ec2.yml',
        templateId: 'aws-ec2-deploy',
        variables: [...baseVars, { key: 'deploymentTarget', value: 'aws_ec2' }],
      });
      break;

    case DeploymentTarget.DOCKER:
      files.push({
        path: '.github/workflows/build-docker.yml',
        templateId: 'docker-build',
        variables: [...baseVars, { key: 'deploymentTarget', value: 'docker' }],
      });
      break;
  }

  // Add multi-environment workflows if enabled
  if (user.multiEnvironment && user.environments.length > 0) {
    for (const env of user.environments) {
      files.push({
        path: `.github/workflows/deploy-${env}.yml`,
        templateId: 'multi-env-deploy',
        variables: [
          ...baseVars,
          { key: 'environment', value: env },
          { key: 'deploymentTarget', value: user.deploymentTarget },
        ],
      });
    }
  }

  return files;
}

/**
 * Determines which Docker files should be generated based on the framework
 * and Docker requirement.
 */
function planDockerFiles(config: DevForgeConfig): PlannedFile[] {
  const files: PlannedFile[] = [];
  const user = config.user;
  const detected = config.detected;

  if (!user.dockerRequired && user.deploymentTarget !== DeploymentTarget.DOCKER) {
    return files;
  }

  const baseVars = buildBaseVariables(config);

  // Select appropriate Dockerfile template based on framework
  let dockerfileTemplate = 'dockerfile-node';
  if (detected.framework === Framework.NEXTJS) {
    dockerfileTemplate = 'dockerfile-nextjs';
  }

  files.push({
    path: 'Dockerfile',
    templateId: dockerfileTemplate,
    variables: baseVars,
  });

  files.push({
    path: 'docker-compose.yml',
    templateId: 'docker-compose',
    variables: [...baseVars, { key: 'framework', value: detected.framework }],
  });

  files.push({
    path: '.dockerignore',
    templateId: 'dockerignore',
    variables: baseVars,
  });

  return files;
}

/**
 * Validates that all template IDs in the plan exist in the AVAILABLE_TEMPLATES registry.
 * Throws GeneratorError if an unknown template ID is encountered.
 */
function validateTemplateIds(files: PlannedFile[]): void {
  for (const file of files) {
    if (!AVAILABLE_TEMPLATES.has(file.templateId)) {
      throw new GeneratorError(
        `Unknown template ID "${file.templateId}" for file "${file.path}". ` +
          `Available templates: ${Array.from(AVAILABLE_TEMPLATES).join(', ')}`,
      );
    }
  }
}

/**
 * Computes a SHA-256 hash of the generation plan files.
 * This hash is used to detect changes between runs.
 */
function computePlanHash(files: PlannedFile[]): string {
  const filesSerialized = JSON.stringify(
    files.map((f) => ({ path: f.path, templateId: f.templateId })),
    null,
    2,
  );
  return createHash('sha256').update(filesSerialized).digest('hex');
}

/**
 * Builds a complete generation plan from a DevForgeConfig.
 * The plan describes all files that will be generated, their templates,
 * and their variables, but does not generate any files.
 *
 * @param config — The complete DevForge configuration
 * @returns A fully validated GenerationPlan
 * @throws GeneratorError if template IDs are unknown
 */
export function buildGenerationPlan(config: DevForgeConfig): GenerationPlan {
  // Plan all files
  const workflowFiles = planWorkflowFiles(config);
  const dockerFiles = planDockerFiles(config);
  const allFiles = [...workflowFiles, ...dockerFiles];

  // Validate all template IDs exist
  validateTemplateIds(allFiles);

  // Compute plan hash
  const planHash = computePlanHash(allFiles);

  return {
    files: allFiles,
    planHash,
    framework: config.detected.framework,
    deploymentTarget: config.user.deploymentTarget,
    generatedAt: new Date().toISOString(),
    devforgeVersion: config.devforgeVersion,
  };
}
