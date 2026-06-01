import chalk from 'chalk';
import inquirer from 'inquirer';
import { createTwoFilesPatch } from 'diff';
import path from 'path';
import { buildGenerationPlan, GenerationPlan, PlannedFile } from '../engine/ruleEngine';
import { renderTemplateFromArray } from '../engine/templateRenderer';
import { getTemplate } from '../templates';
import { DevForgeFS } from '../utils/fs';
import { logger } from '../utils/logger';
import { DevForgeConfig, validateConfig } from '../types';
import { GenerationResult, LastRunMetadata } from '../generator';

interface UpdateOptions {
  dryRun?: boolean;
}

interface PlannedDiff {
  file: PlannedFile;
  rendered: string;
  merged: string;
  existing: string;
  patch: string;
}

const LAST_RUN_PATH = '.devforge/last-run.json';
const PRESERVE_BLOCK_REGEX =
  /(^[ \t]*# @devforge-preserve-start:[^\n]*\r?\n)([\s\S]*?)(^[ \t]*# @devforge-preserve-end:[^\n]*\r?\n?)/gm;

export async function updateCommand(
  projectRoot: string,
  options: UpdateOptions = {},
): Promise<void> {
  const fs = new DevForgeFS(projectRoot, Boolean(options.dryRun));

  if (!(await fs.fileExists(LAST_RUN_PATH).catch(() => false))) {
    throw new Error("No previous DevForge run found. Run 'devforge init' first.");
  }

  const lastRun = await readLastRun(fs);
  const config = validateConfig(lastRun.config);
  const nextPlan = buildGenerationPlan(config);

  if (nextPlan.planHash === lastRun.planHash) {
    logger.success('✓ Workflows are up to date. No changes needed.');
    return;
  }

  const diffs = await buildDiffs(fs, nextPlan);

  if (diffs.length === 0) {
    logger.success('✓ Workflows are up to date. No changes needed.');
    if (!options.dryRun) {
      await persistLastRun(fs, config, nextPlan.planHash, emptyGenerationResult());
    }
    return;
  }

  printDiffs(diffs);

  if (options.dryRun) {
    logger.info('Dry run complete. No files were changed.');
    return;
  }

  let shouldApply = false;
  if (process.env.CI === 'true') {
    // In CI/non-interactive environments, auto-apply changes
    shouldApply = true;
    logger.info('CI environment detected. Auto-applying changes.');
  } else {
    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'apply',
        message: 'Apply these changes? (Y/n)',
        default: true,
      },
    ]);
    shouldApply = answer.apply;
  }

  if (!shouldApply) {
    logger.info('Update cancelled.');
    return;
  }

  const generationResult = await applyDiffs(fs, diffs);
  await persistLastRun(fs, config, nextPlan.planHash, generationResult);
  logger.success(`✓ Updated ${generationResult.written.length} file(s).`);
}

async function readLastRun(fs: DevForgeFS): Promise<LastRunMetadata> {
  const content = await fs.readFile(LAST_RUN_PATH);
  try {
    return JSON.parse(content) as LastRunMetadata;
  } catch (error) {
    throw new Error(`Unable to parse ${LAST_RUN_PATH}: ${(error as Error).message}`);
  }
}

async function buildDiffs(fs: DevForgeFS, plan: GenerationPlan): Promise<PlannedDiff[]> {
  const diffs: PlannedDiff[] = [];

  for (const file of plan.files) {
    const existing = (await fs.fileExists(file.path).catch(() => false))
      ? await fs.readFile(file.path).catch(() => '')
      : '';
    const rendered = renderTemplateFromArray(getTemplate(file.templateId), file.variables);
    const merged = mergePreservedBlocks(existing, rendered);

    if (existing === merged) {
      continue;
    }

    const patch = createTwoFilesPatch(
      file.path,
      file.path,
      existing,
      merged,
      'previous',
      'current',
      {
        context: 3,
      },
    );

    diffs.push({ file, rendered, merged, existing, patch });
  }

  return diffs;
}

function mergePreservedBlocks(existing: string, rendered: string): string {
  const preservedBlocks = extractPreservedBlocks(existing);
  if (preservedBlocks.length === 0) {
    return rendered;
  }

  return rendered.replace(PRESERVE_BLOCK_REGEX, () => `${preservedBlocks.join('\n\n')}\n`);
}

function extractPreservedBlocks(content: string): string[] {
  const blocks: string[] = [];
  const pattern =
    /(^[ \t]*# @devforge-preserve-start:[^\n]*\r?\n[\s\S]*?^[ \t]*# @devforge-preserve-end:[^\n]*\r?\n?)/gm;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match[1]) {
      blocks.push(match[1].trimEnd());
    }
  }

  return blocks;
}

function printDiffs(diffs: PlannedDiff[]): void {
  for (const diff of diffs) {
    console.log(chalk.cyan.bold(`\n${diff.file.path}`));
    for (const line of diff.patch.split(/\r?\n/)) {
      if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) {
        console.log(chalk.gray(line));
      } else if (line.startsWith('+')) {
        console.log(chalk.green(line));
      } else if (line.startsWith('-')) {
        console.log(chalk.red(line));
      } else if (line.length > 0) {
        console.log(line);
      }
    }
  }
}

async function applyDiffs(fs: DevForgeFS, diffs: PlannedDiff[]): Promise<GenerationResult> {
  const result: GenerationResult = {
    written: [],
    skipped: [],
    backed_up: [],
    errors: [],
  };

  for (const diff of diffs) {
    const parent = path.posix.dirname(diff.file.path);
    if (parent && parent !== '.') {
      await fs.ensureDir(parent);
    }

    await fs.writeFile(diff.file.path, diff.merged);
    result.written.push(diff.file.path);
  }

  return result;
}

async function persistLastRun(
  fs: DevForgeFS,
  config: DevForgeConfig,
  planHash: string,
  generationResult: GenerationResult,
): Promise<void> {
  await fs.ensureDir('.devforge');
  const metadata: LastRunMetadata = {
    generationResult,
    planHash,
    timestamp: new Date().toISOString(),
    config,
  };
  await fs.writeFile(LAST_RUN_PATH, JSON.stringify(metadata, null, 2));
}

function emptyGenerationResult(): GenerationResult {
  return {
    written: [],
    skipped: [],
    backed_up: [],
    errors: [],
  };
}

export default updateCommand;
