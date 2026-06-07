import { DevForgeFS } from '../../../utils/fs';
import { DevForgeGraphUpdate, DevForgeGraphStateType } from '../stateAnnotation';
import { logger } from '../../../utils/logger';

export function createIaCWriteNode(fs: DevForgeFS) {
  return async function iacWriteNode(
    state: DevForgeGraphStateType,
  ): Promise<DevForgeGraphUpdate> {
    const output = state.iacGenerationOutput;
    if (!output || !state.iacVerifyResult?.passed) {
      return { phase: 'iac_write', iacSkipped: true };
    }

    const written: string[] = [];
    for (const file of output.files) {
      try {
        await fs.writeFile(file.relativePath, file.content);
        written.push(file.relativePath);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'write failed';
        logger.warn(`IaCWriteNode: failed to write ${file.relativePath}: ${message}`);
      }
    }

    logger.info(`✓ Generated ${written.length} IaC file(s):`);
    for (const p of written) {
      logger.info(`  ${p}`);
    }

    if (output.installInstructions.length > 0) {
      logger.info('\nNext steps:');
      for (const step of output.installInstructions) {
        logger.info(`  ${step}`);
      }
    }

    if (output.notes.length > 0) {
      logger.info('\nNotes:');
      for (const note of output.notes) {
        logger.info(`  ⚠ ${note}`);
      }
    }

    return {
      phase: 'iac_write',
      fixedFiles: written,
    };
  };
}
