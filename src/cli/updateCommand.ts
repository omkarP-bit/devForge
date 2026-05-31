import { DevForgeFS } from '../utils/fs';
import { logger } from '../utils/logger';

export async function updateCommand(projectRoot: string, options: { dryRun?: boolean } = {}) {
  const fs = new DevForgeFS(projectRoot, Boolean(options.dryRun));

  const exists = await fs.fileExists('.devforge/last-run.json').catch(() => false);
  if (!exists) {
    logger.error("No previous DevForge run found. Run 'devforge init' first.");
    // throw so CLI can exit with non-zero code
    throw new Error("No previous DevForge run found. Run 'devforge init' first.");
  }

  const content = await fs.readFile('.devforge/last-run.json');
  let lastRun: unknown;
  try {
    lastRun = JSON.parse(content);
  } catch (err) {
    logger.error('Failed to parse .devforge/last-run.json');
    throw err;
  }

  // Log the stored planHash when available to give immediate feedback
  const lastRunObj = lastRun as Record<string, unknown> | undefined;
  const planHash =
    lastRunObj && typeof lastRunObj.planHash === 'string'
      ? (lastRunObj.planHash as string)
      : 'unknown';
  logger.info(`Loaded previous run metadata (planHash=${planHash})`);
  // TODO: Implement full update flow: regenerate plan, diff, preserve blocks, prompt, apply
  logger.info('Update command scaffolded (Task 6.1) — full implementation pending');
}

export default updateCommand;
