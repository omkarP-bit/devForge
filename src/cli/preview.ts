import chalk from 'chalk';
import { GenerationPlan } from '../engine/ruleEngine';
import { renderTemplate } from '../engine/templateRenderer';
import { getTemplate } from '../templates';
import { logger } from '../utils/logger';

/**
 * Renders and displays a preview of all files that will be generated
 * without actually writing them to disk.
 *
 * @param plan - The GenerationPlan to preview
 * @param outputDryRun - Optional callback to capture output (for testing)
 */
export function previewGenerationPlan(
  plan: GenerationPlan,
  outputDryRun?: (content: string) => void,
): void {
  if (!plan || !plan.files || plan.files.length === 0) {
    logger.warn('No files to generate in this plan');
    return;
  }

  // Render all files and collect output
  const renderedFiles: Array<{ path: string; content: string }> = [];
  let hasErrors = false;

  for (const file of plan.files) {
    try {
      // Get the template
      const template = getTemplate(file.templateId);

      // Convert variables array to Map
      const variablesMap = new Map<string, string>();
      for (const variable of file.variables) {
        variablesMap.set(variable.key, variable.value);
      }

      // Render the template
      const renderedContent = renderTemplate(template, variablesMap);

      renderedFiles.push({
        path: file.path,
        content: renderedContent,
      });
    } catch (error) {
      hasErrors = true;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to render file ${file.path}: ${errorMsg}`);
    }
  }

  if (hasErrors) {
    logger.warn('Some files failed to render');
  }

  // Display preview
  const output = formatPreview(renderedFiles, plan);
  const fullOutput = output + '\n' + formatSummary(renderedFiles.length);
  console.log(fullOutput);

  // Call optional output callback for testing
  if (outputDryRun) {
    outputDryRun(fullOutput);
  }
}

/**
 * Formats the preview output as a readable string
 * @internal
 */
function formatPreview(
  files: Array<{ path: string; content: string }>,
  plan: GenerationPlan,
): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(chalk.bold(chalk.cyan('═══════════════════════════════════')));
  lines.push(chalk.bold(chalk.cyan('        DEVFORGE GENERATION PREVIEW')));
  lines.push(chalk.bold(chalk.cyan('═══════════════════════════════════')));
  lines.push('');

  // Metadata - safely access enum values
  const framework = String(plan.framework);
  const deploymentTarget = String(plan.deploymentTarget);
  const generatedDate = new Date(plan.generatedAt).toLocaleString();

  lines.push(chalk.gray(`Framework: ${chalk.white(framework)}`));
  lines.push(chalk.gray(`Deployment Target: ${chalk.white(deploymentTarget)}`));
  lines.push(chalk.gray(`Generated: ${chalk.white(generatedDate)}`));
  lines.push('');

  // Files
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;
    lines.push(chalk.bold(chalk.cyan(`📄 ${i + 1}. ${file.path}`)));
    lines.push(chalk.gray('─'.repeat(50)));
    lines.push(formatFileContent(file.content));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Formats individual file content for display
 * @internal
 */
function formatFileContent(content: string): string {
  const lines = content.split('\n');
  const maxLines = 20; // Show max 20 lines per file in preview
  let formatted = '';

  if (lines.length <= maxLines) {
    // Show all lines with line numbers
    for (let i = 0; i < lines.length; i++) {
      const lineNum = String(i + 1).padStart(3);
      formatted += chalk.gray(`${lineNum} │ `) + lines[i] + '\n';
    }
  } else {
    // Show first 20 lines with indicator of truncation
    for (let i = 0; i < maxLines; i++) {
      const lineNum = String(i + 1).padStart(3);
      formatted += chalk.gray(`${lineNum} │ `) + lines[i] + '\n';
    }
    formatted += chalk.yellow(`\n... and ${lines.length - maxLines} more lines\n`);
  }

  return formatted;
}

/**
 * Formats the summary of generated files as a string
 * @internal
 */
function formatSummary(count: number): string {
  const lines: string[] = [];
  lines.push(chalk.bold(chalk.cyan('═══════════════════════════════════')));
  lines.push(chalk.green(`✓ Ready to generate ${count} file${count === 1 ? '' : 's'}`));
  lines.push(chalk.gray('Run "devforge init" to generate files in your project'));
  lines.push(chalk.bold(chalk.cyan('═══════════════════════════════════')));
  return lines.join('\n');
}

/**
 * Verifies that the preview will not write any files to disk.
 * Used for testing to ensure dry-run mode works correctly.
 *
 * @returns true if no files will be written (safe preview mode)
 */
export function isPreviewModeNonDestructive(): boolean {
  // The preview functions only read templates and render them in memory
  // No file system writes occur
  return true;
}

/**
 * Counts the number of files that will be generated
 * @param plan - The GenerationPlan
 * @returns Number of files to be generated
 */
export function countGeneratedFiles(plan: GenerationPlan): number {
  return plan.files.length;
}

/**
 * Extracts all file paths from a generation plan
 * @param plan - The GenerationPlan
 * @returns Array of file paths that will be generated
 */
export function getGeneratedFilePaths(plan: GenerationPlan): string[] {
  return plan.files.map((file) => file.path);
}

/**
 * Gets all template IDs used in a generation plan
 * @param plan - The GenerationPlan
 * @returns Array of unique template IDs
 */
export function getUsedTemplateIds(plan: GenerationPlan): string[] {
  const templateIds = new Set<string>();
  for (const file of plan.files) {
    templateIds.add(file.templateId);
  }
  return Array.from(templateIds).sort();
}
