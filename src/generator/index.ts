import { GenerationPlan } from '../engine/ruleEngine';
import { DevForgeFS } from '../utils/fs';
import { renderTemplate } from '../engine/templateRenderer';
import { getTemplate } from '../templates';
import { logger } from '../utils/logger';
import { GeneratorError } from '../utils/errors';
import inquirer from 'inquirer';
import { validateWorkflowYaml } from '../validator/yamlValidator';

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
  const transaction: Array<{
    path: string;
    action: 'write' | 'backup';
    previousContent?: string;
  }> = [];

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
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
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
            const errorMsg = backupError instanceof Error ? backupError.message : 'Unknown error';
            throw new GeneratorError(`Failed to create backup: ${errorMsg}`);
          }
        }
      }

      // Ensure parent directory exists
      const parentDir = plannedFile.path.substring(0, plannedFile.path.lastIndexOf('/'));
      if (parentDir) {
        await fs.ensureDir(parentDir);
      }

      // If this is a workflow file, validate YAML before writing
      const isWorkflowFile = /^\.github\/workflows\/.+\.ya?ml$/i.test(plannedFile.path);
      // Only validate if file looks like a workflow (contains typical workflow keys)
      const looksLikeWorkflow = /\bon\s*:\b|\bjobs\s*:/i.test(renderedContent);
      if (isWorkflowFile && looksLikeWorkflow) {
        try {
          const validation = validateWorkflowYaml(renderedContent, plannedFile.path);
          // Report warnings but allow write; errors block the write
          for (const w of validation.warnings) {
            logger.warn(`Workflow warning for ${plannedFile.path}: ${w.code} - ${w.message}`);
          }
          if (validation.errors.length > 0) {
            // Do not write the invalid workflow; add to errors and continue
            for (const e of validation.errors) {
              result.errors.push({ path: plannedFile.path, error: `${e.code}: ${e.message}` });
              logger.error(`Validation failed for ${plannedFile.path}: ${e.code} - ${e.message}`);
            }
            // Skip writing this file due to validation errors
            continue;
          }
        } catch (valErr) {
          const msg = valErr instanceof Error ? valErr.message : String(valErr);
          result.errors.push({ path: plannedFile.path, error: `VALIDATION_EXCEPTION: ${msg}` });
          logger.error(`Validation exception for ${plannedFile.path}: ${msg}`);
          continue;
        }
      }

      // Write the file
      await fs.writeFile(plannedFile.path, renderedContent);
      result.written.push(plannedFile.path);
      transaction.push({ path: plannedFile.path, action: 'write', previousContent: undefined });
      logger.success(`Generated: ${plannedFile.path}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push({
        path: plannedFile.path,
        error: errorMsg,
      });
      logger.error(`Error generating ${plannedFile.path}: ${errorMsg}`);
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
    await fs.writeFile('.devforge/last-run.json', JSON.stringify(metadata, null, 2));
  } catch (error) {
    logger.warn('Failed to write last-run metadata (non-critical)');
  }

  // If errors occurred during generation, write a transaction log for possible rollback
  if (result.errors.length > 0) {
    try {
      await fs.ensureDir('.devforge/transactions');
      const txPath = `.devforge/transactions/tx-${Date.now()}.json`;
      await fs.writeFile(
        txPath,
        JSON.stringify({ planHash: plan.planHash, transaction, errors: result.errors }, null, 2),
      );
      logger.warn(`Generation completed with errors; transaction recorded at ${txPath}`);
    } catch (txErr) {
      logger.warn('Failed to write transaction log (non-critical)');
    }
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
  console.log(`✓ Generated ${result.written.length} file${result.written.length === 1 ? '' : 's'}`);
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
    console.log(`✗ ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}`);
  }
  console.log('');
}
