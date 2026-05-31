import chalk from 'chalk';
import inquirer from 'inquirer';
import { DevForgeFS } from '../utils/fs';
import { logger } from '../utils/logger';
import { runDetection } from '../detector';
import { collectUserConfig } from './prompts';
import { buildGenerationPlan, GenerationPlan } from '../engine/ruleEngine';
import { previewGenerationPlan } from './preview';
import { runGenerator } from '../generator';
import { extractSecrets, generateSecretsDoc } from '../secrets/secretsAnalyzer';
import { DevForgeConfigSchema } from '../types';
import { readFile } from 'fs/promises';

/**
 * Orchestrates the complete DevForge initialization workflow.
 * Steps: Detection → Prompts → Plan → Preview (optional) → Generation → Secrets Doc
 *
 * @param projectRoot - Root directory of the project to initialize
 * @param options - Configuration options
 * @throws Error if any step fails; logs error and exits with code 1
 */
export async function initCommand(
  projectRoot: string,
  options: {
    dryRun?: boolean;
    forceDetect?: boolean;
    preview?: boolean;
  } = {},
): Promise<void> {
  const dryRun = options.dryRun ?? false;

  try {
    // Print DevForge banner
    printBanner();

    // Initialize filesystem abstraction
    const fs = new DevForgeFS(projectRoot, dryRun);

    // Step 1: Project Detection
    logger.info('[1/6] Detecting your project...');
    const detected = await runDetection(fs, { forceDetect: options.forceDetect });

    // Step 2: Collect User Configuration
    logger.info('[2/6] Gathering your preferences...');
    const userConfig = await collectUserConfig(detected);

    // Step 3: Build Generation Plan
    logger.info('[3/6] Building generation plan...');
    const config = {
      projectRoot,
      detected,
      user: userConfig,
      dryRun,
      generatedAt: new Date().toISOString(),
      devforgeVersion: await getPackageVersion(),
    };

    // Validate config with Zod
    const validatedConfig = DevForgeConfigSchema.parse(config);
    const plan = buildGenerationPlan(validatedConfig);

    logger.success(`✓ Plan created with ${plan.files.length} files`);

    // Step 4: Optional Preview
    let shouldGenerate = true;
    if (options.preview) {
      logger.info('[4/6] Previewing files...');
      previewGenerationPlan(plan);

      const confirmPreview = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: 'Proceed with generation?',
          default: true,
        },
      ]);
      shouldGenerate = confirmPreview.proceed;
    } else {
      // Ask if user wants preview
      const askPreview = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'wantPreview',
          message: 'Preview files before generating?',
          default: false,
        },
      ]);

      if (askPreview.wantPreview) {
        logger.info('[4/6] Previewing files...');
        previewGenerationPlan(plan);

        const confirmPreview = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: 'Proceed with generation?',
            default: true,
          },
        ]);
        shouldGenerate = confirmPreview.proceed;
      }
    }

    if (!shouldGenerate) {
      logger.info('Generation cancelled.');
      return;
    }

    // Step 5: Generate Files
    logger.info('[5/6] Generating files...');
    const generationResult = await runGenerator(plan, fs);

    if (generationResult.errors && generationResult.errors.length > 0) {
      logger.error('Generation completed with errors:');
      for (const err of generationResult.errors) {
        logger.error(`  • ${err.path}: ${err.error}`);
      }
    }

    const totalGenerated = generationResult.written.length;
    logger.success(`✓ Generated ${totalGenerated} files`);

    // Step 6: Extract Secrets and Generate Documentation
    logger.info('[6/6] Extracting secrets and generating documentation...');

    // Read the rendered files to extract secrets
    const renderedFiles = await readRenderedFiles(fs, plan);
    const secrets = extractSecrets(renderedFiles);
    const secretsDoc = generateSecretsDoc(secrets);

    // Write SECRETS_REQUIRED.md
    await fs.writeFile('.devforge/SECRETS_REQUIRED.md', secretsDoc);

    logger.success('✓ SECRETS_REQUIRED.md created');

    // Print final success message
    printSuccessMessage(totalGenerated, secrets.length);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`\n✗ DevForge initialization failed: ${errorMsg}`);

    if (process.env.DEBUG) {
      console.error(error);
    }

    throw error;
  }
}

/**
 * Prints the DevForge banner with branding
 * @internal
 */
function printBanner(): void {
  console.log('');
  console.log(chalk.bold(chalk.cyan('╔══════════════════════════════════════╗')));
  console.log(chalk.bold(chalk.cyan('║          🚀 DevForge 1.0.0            ║')));
  console.log(chalk.bold(chalk.cyan('║  Automated CI/CD Pipeline Generator   ║')));
  console.log(chalk.bold(chalk.cyan('╚══════════════════════════════════════╝')));
  console.log('');
}

/**
 * Prints the final success message
 * @internal
 */
function printSuccessMessage(fileCount: number, secretCount: number): void {
  console.log('');
  console.log(chalk.bold(chalk.green('✓ DevForge setup complete!')));
  console.log('');
  console.log(chalk.cyan(`  → ${fileCount} workflow files generated`));
  console.log(chalk.cyan(`  → SECRETS_REQUIRED.md created — add ${secretCount} secret(s)`));
  console.log(chalk.cyan('  → To add secrets to your repository:'));
  console.log(chalk.cyan('    1. Open your GitHub repository'));
  console.log(chalk.cyan('    2. Go to Settings → Secrets and variables → Actions'));
  console.log(chalk.cyan('    3. Add each secret from SECRETS_REQUIRED.md'));
  console.log('');
  console.log(chalk.gray('  📄 View: cat .devforge/SECRETS_REQUIRED.md'));
  console.log(chalk.gray('  🔗 Push and GitHub Actions will run your workflows!'));
  console.log('');
}

/**
 * Reads rendered files from the generation result
 * @internal
 */
async function readRenderedFiles(
  fs: DevForgeFS,
  plan: GenerationPlan,
): Promise<Array<{ path: string; content: string }>> {
  const renderedFiles: Array<{ path: string; content: string }> = [];

  for (const plannedFile of plan.files) {
    try {
      const content = await fs.readFile(plannedFile.path);
      renderedFiles.push({
        path: plannedFile.path,
        content,
      });
    } catch {
      // File might not exist in dry-run mode, skip
    }
  }

  return renderedFiles;
}

/**
 * Reads package.json to get version
 * @internal
 */
async function getPackageVersion(): Promise<string> {
  try {
    const packageJson = await readFile('./package.json', 'utf-8');
    const parsed = JSON.parse(packageJson);
    return parsed.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}
