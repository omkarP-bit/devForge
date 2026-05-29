import ora from 'ora';
import Table from 'cli-table3';
import { DetectedProject, DetectedProjectSchema, Framework } from '../types';
import { DevForgeFS } from '../utils/fs';
import { parsePackageJson } from './packageJsonParser';
import { detectFramework } from './frameworkDetector';
import { detectPackageManager, detectNodeVersion } from './packageManagerDetector';
import { detectProjectMeta } from './frameworkDetector';
import { DetectionError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Runs the full project detection engine.
 * Orchestrates parsing package.json, framework detection, package manager detection,
 * Node.js version detection, and project structure scanning.
 * Validates the final result against the Zod schema and prints a summary table.
 */
export async function runDetection(fs: DevForgeFS): Promise<DetectedProject> {
  const spinner = ora('Reading package.json...').start();
  try {
    const pkg = await parsePackageJson(fs);

    spinner.text = 'Detecting framework...';
    const framework = await detectFramework(pkg, fs);

    spinner.text = 'Detecting package manager...';
    const packageManager = await detectPackageManager(fs);

    spinner.text = 'Reading Node.js version...';
    const nodeVersion = await detectNodeVersion(fs, pkg);

    spinner.text = 'Scanning project structure...';
    const meta = await detectProjectMeta(pkg, fs, packageManager);

    spinner.succeed('Project detection completed successfully!');

    if (framework === Framework.UNKNOWN) {
      logger.warn(
        'Framework could not be auto-detected. You can specify it manually in the configuration phase.',
      );
    }

    const detected: DetectedProject = {
      framework,
      packageManager,
      nodeVersion,
      hasDocker: meta.hasDocker,
      hasTests: meta.hasTests,
      hasLinting: meta.hasLinting,
      testCommand: meta.testCommand,
      buildCommand: meta.buildCommand,
      installCommand: meta.installCommand,
      detectedAt: new Date().toISOString(),
    };

    const parsed = DetectedProjectSchema.safeParse(detected);
    if (!parsed.success) {
      const errorMsg = parsed.error.errors[0]
        ? `${parsed.error.errors[0].path.join('.')}: ${parsed.error.errors[0].message}`
        : 'Invalid detection result';
      throw new DetectionError(`Detected project validation failed: ${errorMsg}`);
    }

    // Format tests info
    let testsVal = 'No';
    if (meta.hasTests) {
      const testTools: string[] = [];
      if (pkg.hasField('jest')) testTools.push('jest');
      if (pkg.hasField('vitest')) testTools.push('vitest');
      if (pkg.hasField('mocha')) testTools.push('mocha');
      testsVal = testTools.length > 0 ? `Yes (${testTools.join(', ')})` : 'Yes';
    }

    // Format linting info
    let lintVal = 'No';
    if (meta.hasLinting) {
      const lintTools: string[] = [];
      if (pkg.hasField('eslint')) lintTools.push('eslint');
      if (pkg.hasField('tslint')) lintTools.push('tslint');
      if (pkg.hasField('biome')) lintTools.push('biome');
      lintVal = lintTools.length > 0 ? `Yes (${lintTools.join(', ')})` : 'Yes';
    }

    // Format framework name
    const frameworkNames: Record<Framework, string> = {
      [Framework.REACT]: 'React',
      [Framework.NEXTJS]: 'Next.js',
      [Framework.EXPRESS]: 'Express',
      [Framework.NESTJS]: 'NestJS',
      [Framework.VUE]: 'Vue',
      [Framework.ANGULAR]: 'Angular',
      [Framework.MERN]: 'MERN Stack',
      [Framework.UNKNOWN]: 'Unknown',
    };

    const table = new Table({
      head: ['Property', 'Value'],
    });

    table.push(
      ['Framework', frameworkNames[framework]],
      ['Package Manager', packageManager],
      ['Node Version', nodeVersion],
      ['Docker', meta.hasDocker ? 'Yes' : 'No'],
      ['Tests Detected', testsVal],
      ['Linting Detected', lintVal],
      ['Build Command', meta.buildCommand ?? 'None'],
    );

    console.log(table.toString());

    return parsed.data;
  } catch (error) {
    spinner.fail('Project detection failed!');
    if (error instanceof DetectionError) {
      throw error;
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new DetectionError(`Detection orchestrator failed: ${msg}`);
  }
}
