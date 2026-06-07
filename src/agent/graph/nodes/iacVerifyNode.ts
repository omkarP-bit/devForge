import { IaCVerifier } from '../../../engine/IaCVerifier';
import { DevForgeGraphUpdate, DevForgeGraphStateType } from '../stateAnnotation';
import { logger } from '../../../utils/logger';

export async function iacVerifyNode(
  state: DevForgeGraphStateType,
): Promise<DevForgeGraphUpdate> {
  if (!state.iacGenerationOutput) {
    return { phase: 'iac_verify', iacSkipped: true };
  }

  const tool = state.iacGenerationOutput.tool;
  logger.info(`Verifying ${tool} configuration...`);

  let tempDir: string | null = null;
  try {
    tempDir = await IaCVerifier.createTempDir();
    const verifier = new IaCVerifier(state.context.config.projectRoot);
    const result = await verifier.verify(state.iacGenerationOutput, tempDir);

    if (result.passed) {
      logger.info(`✓ ${tool} configuration verified successfully`);
    } else {
      const errList = result.errors.map((e) => e.message).join(', ');
      logger.warn(`✗ Verification failed: ${errList}`);
    }

    return {
      phase: 'iac_verify',
      iacVerifyResult: result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'IaC verification failed';
    logger.warn(`IaC verification error: ${message}`);
    return {
      phase: 'iac_verify',
      iacVerifyResult: {
        tool: state.iacGenerationOutput.tool,
        passed: false,
        errors: [{ file: '', message, fatal: true }],
        warnings: [],
        verifiedAt: new Date().toISOString(),
      },
    };
  } finally {
    if (tempDir) {
      await IaCVerifier.cleanupTempDir(tempDir);
    }
  }
}

export function routeAfterIaCVerify(
  state: DevForgeGraphStateType,
): 'iac_write' | 'iac_generate' | '__end__' {
  const result = state.iacVerifyResult;
  if (!result) return '__end__';

  if (result.passed) {
    return 'iac_write';
  }

  const attempt = state.iacGenerationAttempt;
  const max = state.iacGenerationMaxAttempts;

  if (attempt < max) {
    logger.info(`⟳ Regenerating with error context (attempt ${attempt + 1}/${max})...`);
    return 'iac_generate';
  }

  logger.warn(
    `✗ IaC generation failed after ${max} attempt(s). No files written.\n` +
      result.errors.map((e) => `  - ${e.message}`).join('\n'),
  );
  return '__end__';
}
