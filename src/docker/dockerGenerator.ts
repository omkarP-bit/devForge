import { GenerationPlan, TemplateVariable } from '../engine/ruleEngine';
import { DevForgeFS } from '../utils/fs';
import { renderTemplate } from '../engine/templateRenderer';
import { getTemplate } from '../templates';
import { logger } from '../utils/logger';

/**
 * Result of Docker file generation
 */
export interface DockerGenerationResult {
  generated: string[];
  errors: Array<{ path: string; error: string }>;
}

/**
 * Helper to convert TemplateVariable array to Map
 */
function variablesToMap(variables: TemplateVariable[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const v of variables) {
    map.set(v.key, v.value);
  }
  return map;
}

/**
 * Generates Docker-related files (Dockerfile, docker-compose.yml, .dockerignore)
 * based on the generation plan variables.
 *
 * @param plan - The GenerationPlan containing Docker files
 * @param fs - DevForgeFS instance for file operations
 * @returns DockerGenerationResult with summary of generated files
 */
export async function generateDockerFiles(
  plan: GenerationPlan,
  fs: DevForgeFS,
): Promise<DockerGenerationResult> {
  const result: DockerGenerationResult = {
    generated: [],
    errors: [],
  };

  try {
    // Find Docker-related files in the plan
    const dockerFiles = plan.files.filter((file) =>
      file.path.match(/Dockerfile|docker-compose|\.dockerignore/i),
    );

    for (const plannedFile of dockerFiles) {
      try {
        const template = getTemplate(plannedFile.templateId);
        const variables = variablesToMap(plannedFile.variables);
        const content = renderTemplate(template, variables);

        await fs.writeFile(plannedFile.path, content);
        result.generated.push(plannedFile.path);
        logger.info(`Generated: ${plannedFile.path}`);
      } catch (fileError) {
        const errorMsg =
          fileError instanceof Error ? fileError.message : 'Unknown error';
        result.errors.push({
          path: plannedFile.path,
          error: errorMsg,
        });
        logger.error(`Docker file generation error for ${plannedFile.path}: ${errorMsg}`);
      }
    }
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : 'Unknown error during Docker generation';
    result.errors.push({
      path: 'Docker generation',
      error: errorMsg,
    });
    logger.error(`Docker generation error: ${errorMsg}`);
  }

  return result;
}

/**
 * Checks if a GenerationPlan includes Docker files
 *
 * @param plan - The GenerationPlan to analyze
 * @returns true if plan includes Docker files
 */
export function hasDockerFiles(plan: GenerationPlan): boolean {
  return plan.files.some((file) =>
    file.path.match(/Dockerfile|docker-compose|\.dockerignore/i),
  );
}

/**
 * Extracts framework and configuration from GenerationPlan
 * to determine which Dockerfile template to use
 *
 * @param plan - The GenerationPlan to analyze
 * @returns 'nextjs' or 'node' based on framework
 */
export function getDockerfileTemplate(plan: GenerationPlan): 'dockerfile-nextjs' | 'dockerfile-node' {
  const framework = plan.framework.toLowerCase();
  return framework.includes('next') ? 'dockerfile-nextjs' : 'dockerfile-node';
}
