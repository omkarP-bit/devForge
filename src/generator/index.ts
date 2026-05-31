import { GenerationPlan } from '../engine/ruleEngine';
import { DevForgeFS } from '../utils/fs';
import { renderTemplate } from '../engine/templateRenderer';
import { getTemplate } from '../templates';
import { logger } from '../utils/logger';
import { GeneratorError } from '../utils/errors';
import inquirer from 'inquirer';

/**
 * Result of a generation run with summary of what was written, skipped, and backed up.
 */
export interface GenerationResult {
  written: string[];
  skipped: string[];
  backed_up: string[];
  errors: Array<{ path: string; error: string }>;
}

/**
 * Last run metadata stored in .devforge/last-run.json
 */
export interface LastRunMetadata {
  generationResult: GenerationResult;
  planHash: string;
  timestamp: string;
}

/**
 * Runs the generator: iterates over a GenerationPlan, renders each file,
 * and writes it to disk via DevForgeFS. Handles existing file conflicts
 * by prompting the user to overwrite, skip, or back up.
 *
 * @param plan - The GenerationPlan describing files to generate
 * @param fs - DevForgeFS instance for file operations
 * @returns GenerationResult with summary of written/skipped/backed_up files
 */
export async function runGenerator(
  plan: GenerationPlan,
  fs: DevForgeFS,
): Promise<GenerationResult> {
  const result: GenerationResult = {
    written: [],
    skipped: [],
    backed_up: [],
    errors: [],
  };

  if (!plan || !plan.files || plan.files.length === 0) {
    logger.warn('No files in generation plan');
    return result;
  }

  // Build variables map for template rendering
  const variablesMap = new Map<string, string>();
  for (const file of plan.files) {
    for (const variable of file.variables) {
      variablesMap.set(variable.key, variable.value);
    }
  }

  // Process each file in the plan
  for (const plannedFile of plan.files) {
    try {
      // Render the template
      let renderedContent: string;
      try {
        const template = getTemplate(plannedFile.templateId);
        const fileVariables = new Map<string, string>();
        for (const variable of plannedFile.variables) {
          fileVariables.set(variable.key, variable.value);
        }
        renderedContent = renderTemplate(template, fileVariables);
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : 'Unknown error';
        throw new GeneratorError(`Failed to render template: ${errorMsg}`);
      }

      // Check if file already exists
      const fileExists = await fs.fileExists(plannedFile.path);

      if (fileExists) {
        // Prompt user for conflict resolution
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: `File already exists: ${plannedFile.path}`,
            choices: [
              { name: 'Overwrite', value: 'overwrite' },
              { name: 'Skip', value: 'skip' },
              {
                name: 'Backup and overwrite',
                value: 'backup',
              },
            ],
            default: 'skip',
          },
        ]);

        if (answers.action === 'skip') {
          result.skipped.push(plannedFile.path);
          logger.info(`Skipped (exists): ${plannedFile.path}`);
          continue;
        }

        if (answers.action === 'backup') {
          // Create backup of existing file
          const backupPath = `${plannedFile.path}.devforge.bak`;
          try {
            const existingContent = await fs.readFile(plannedFile.path);
            await fs.writeFile(backupPath, existingContent);
            result.backed_up.push(plannedFile.path);
            logger.info(`Backed up to: ${backupPath}`);
          } catch (backupError) {
            const errorMsg =
              backupError instanceof Error
                ? backupError.message
                : 'Unknown error';
            throw new GeneratorError(
              `Failed to create backup: ${errorMsg}`,
            );
          }
        }
      }

      // Ensure parent directory exists
      const parentDir = plannedFile.path.substring(
        0,
        plannedFile.path.lastIndexOf('/'),
      );
      if (parentDir) {
        await fs.ensureDir(parentDir);
      }

      // Write the file
      await fs.writeFile(plannedFile.path, renderedContent);
      result.written.push(plannedFile.path);
      logger.success(`Generated: ${plannedFile.path}`);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : 'Unknown error';
      result.errors.push({
        path: plannedFile.path,
        error: errorMsg,
      });
      logger.error(
        `Error generating ${plannedFile.path}: ${errorMsg}`,
      );
    }
  }

  // Write last-run metadata
  try {
    const metadata: LastRunMetadata = {
      generationResult: result,
      planHash: plan.planHash,
      timestamp: new Date().toISOString(),
    };
    await fs.ensureDir('.devforge');
    await fs.writeFile(
      '.devforge/last-run.json',
      JSON.stringify(metadata, null, 2),
    );
  } catch (error) {
    logger.warn('Failed to write last-run metadata (non-critical)');
  }

  // Print summary
  printGenerationSummary(result);

  return result;
}

/**
 * Prints a human-readable summary of the generation result
 * @internal
 */
function printGenerationSummary(result: GenerationResult): void {
  console.log('');
  console.log(
    `✓ Generated ${result.written.length} file${result.written.length === 1 ? '' : 's'}`,
  );
  if (result.skipped.length > 0) {
    console.log(
      `! Skipped ${result.skipped.length} file${result.skipped.length === 1 ? '' : 's'} (already exist)`,
    );
  }
  if (result.backed_up.length > 0) {
    console.log(
      `↻ Backed up ${result.backed_up.length} file${result.backed_up.length === 1 ? '' : 's'}`,
    );
  }
  if (result.errors.length > 0) {
    console.log(
      `✗ ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}`,
    );
  }
  console.log('');
}
