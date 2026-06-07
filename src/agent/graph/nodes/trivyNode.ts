import { readFileSync } from 'fs';
import { sanitizePath } from '../../../utils/sanitizer';
import { logger } from '../../../utils/logger';
import { TrivyRunner } from '../../security/TrivyRunner';
import { normalizeTrivyResults, getTrivySummary } from '../../security/TrivyNormalizer';
import { DevForgeGraphUpdate, DevForgeGraphStateType } from '../stateAnnotation';

const INSTALL_URL = 'https://aquasecurity.github.io/trivy/latest/getting-started/installation/';

function extractBaseImage(projectRoot: string): string | null {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const content = readFileSync(sanitizePath('Dockerfile', projectRoot), 'utf8');
    const match = content.match(/^FROM\s+(\S+)/m);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function trivyNode(state: DevForgeGraphStateType): Promise<DevForgeGraphUpdate> {
  const runner = new TrivyRunner();

  if (!(await runner.isAvailable())) {
    logger.warn('[trivy] Trivy not found — skipping vulnerability scan');
    logger.info(`[trivy] Install guide: ${INSTALL_URL}`);
    return { trivyViolations: [], trivySkipped: true, trivySummary: null };
  }

  const projectRoot = state.context.config.projectRoot;
  const scanResults = [];

  const baseImage = extractBaseImage(projectRoot);
  if (baseImage) {
    try {
      scanResults.push(await runner.scanImage(baseImage));
    } catch (err) {
      logger.warn(`[trivy] Image scan failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  try {
    scanResults.push(await runner.scanFilesystem(projectRoot));
  } catch (err) {
    logger.warn(
      `[trivy] Filesystem scan failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    const workflowDir = sanitizePath('.github/workflows', projectRoot);
    scanResults.push(await runner.scanConfig(workflowDir));
  } catch (err) {
    logger.warn(`[trivy] Config scan failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const allViolations = scanResults.flatMap(normalizeTrivyResults);
  const trivySummary = getTrivySummary(allViolations);

  return {
    trivyViolations: allViolations,
    trivySkipped: false,
    trivySummary,
  };
}
