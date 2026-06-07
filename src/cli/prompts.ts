import inquirer from 'inquirer';
import Table from 'cli-table3';
import {
  DeploymentTarget,
  BranchStrategy,
  DetectedProject,
  UserConfig,
  UserConfigSchema,
} from '../types';
import { sanitizeString, validateEnum } from '../utils/sanitizer';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Collects user configuration through interactive prompts.
 * All user inputs are sanitized and validated before assembly.
 * Returns a validated UserConfig object.
 */
export async function collectUserConfig(detected: DetectedProject): Promise<UserConfig> {
  // Determine default deployment target based on detected framework
  let defaultTarget = DeploymentTarget.DOCKER;
  if (detected.framework === 'nextjs' || detected.framework === 'react') {
    defaultTarget = DeploymentTarget.VERCEL;
  } else if (detected.framework === 'express' || detected.framework === 'nestjs') {
    defaultTarget = DeploymentTarget.RAILWAY;
  }

  // Prompt for deployment target
  const targetAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'deploymentTarget',
      message: 'Select your deployment target:',
      choices: Object.values(DeploymentTarget),
      default: defaultTarget,
    },
  ]);

  const deploymentTarget = validateEnum<DeploymentTarget>(
    targetAnswer.deploymentTarget,
    Object.values(DeploymentTarget),
  );

  // Prompt for branch strategy
  const branchAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'branchStrategy',
      message: 'Select your Git branch strategy:',
      choices: Object.values(BranchStrategy),
      default: BranchStrategy.FEATURE_MAIN,
    },
  ]);

  const branchStrategy = validateEnum<BranchStrategy>(
    branchAnswer.branchStrategy,
    Object.values(BranchStrategy),
  );

  // Prompt for Docker requirement
  const dockerAnswer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'dockerRequired',
      message: 'Do you need Docker support?',
      default: detected.hasDocker,
    },
  ]);

  const dockerRequired = dockerAnswer.dockerRequired;

  // Prompt for multi-environment support
  const multiEnvAnswer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'multiEnvironment',
      message: 'Do you need multi-environment support (dev, staging, production)?',
      default: false,
    },
  ]);

  const multiEnvironment = multiEnvAnswer.multiEnvironment;

  // Prompt for Trivy vulnerability scanning
  const trivyAnswer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'enableTrivyScan',
      message: 'Include Trivy vulnerability scanning in the generated pipeline? [y/N]',
      default: false,
    },
  ]);

  const enableTrivyScan: boolean = trivyAnswer.enableTrivyScan;

  // Prompt for environment names if multi-environment is enabled
  let environments: string[] = [];
  if (multiEnvironment) {
    const envAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'environments',
        message: 'Enter environment names separated by commas (e.g., "dev,staging,production"):',
        default: 'dev,staging,production',
        validate(input: string): boolean | string {
          if (!input || input.trim().length === 0) {
            return 'Environment names cannot be empty';
          }
          return true;
        },
      },
    ]);

    // Parse and sanitize environment names
    environments = envAnswer.environments
      .split(',')
      .map((env: string) => {
        try {
          return sanitizeString(env.trim(), 50);
        } catch {
          throw new ValidationError(`Invalid environment name: "${env.trim()}"`);
        }
      })
      .filter((env: string) => env.length > 0);

    if (environments.length === 0) {
      throw new ValidationError('At least one environment name must be provided');
    }
  }

  // Assemble UserConfig
  const userConfig: UserConfig = {
    deploymentTarget,
    branchStrategy,
    dockerRequired,
    multiEnvironment,
    environments,
    enableTrivyScan,
  };

  // Validate with Zod schema
  const validationResult = UserConfigSchema.safeParse(userConfig);
  if (!validationResult.success) {
    const firstError = validationResult.error.errors[0];
    const errorMsg = firstError
      ? `${firstError.path.join('.')}: ${firstError.message}`
      : 'Invalid user configuration';
    throw new ValidationError(errorMsg);
  }

  // Print confirmation summary
  printConfigSummary(userConfig);

  return validationResult.data;
}

/**
 * Prints a summary table of the collected user configuration.
 */
function printConfigSummary(config: UserConfig): void {
  const table = new Table({
    head: ['Configuration', 'Value'],
    colWidths: [30, 50],
    style: { head: ['cyan'] },
  });

  table.push(
    ['Deployment Target', config.deploymentTarget],
    ['Branch Strategy', config.branchStrategy],
    ['Docker Support', config.dockerRequired ? 'Yes' : 'No'],
    ['Multi-Environment', config.multiEnvironment ? 'Yes' : 'No'],
    ['Environments', config.environments.length > 0 ? config.environments.join(', ') : 'N/A'],
  );

  console.log('\n' + table.toString() + '\n');
  logger.success('Configuration confirmed!');
}
