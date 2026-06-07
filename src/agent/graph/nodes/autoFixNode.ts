import { applyAutoFixes } from '../../security/AutoFixEngine';
import { getFixableViolations } from '../securityRemediationUtils';
import { DevForgeGraphUpdate, DevForgeGraphStateType } from '../stateAnnotation';
import { DevForgeFS } from '../../../utils/fs';

export interface AutoFixNodeContext {
  fs: DevForgeFS;
}

export function createAutoFixNode(context: AutoFixNodeContext) {
  return async function autoFixNode(state: DevForgeGraphStateType): Promise<DevForgeGraphUpdate> {
    const scopedFiles = new Set(state.context.generatedFiles);
    const fixable = getFixableViolations(state.violations).filter((violation) =>
      scopedFiles.has(violation.affectedFile),
    );

    if (fixable.length === 0) {
      return {
        fixAttempts: state.fixAttempts + 1,
        phase: 'fix',
      };
    }

    const results = await applyAutoFixes(fixable, context.fs);
    const fixedFiles = results
      .filter((result) => result.applied)
      .map((result) => result.violation.affectedFile);

    return {
      fixAttempts: state.fixAttempts + 1,
      fixedFiles,
      phase: 'fix',
    };
  };
}
