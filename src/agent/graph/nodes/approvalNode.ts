import inquirer from 'inquirer';
import { getFixableViolations } from '../securityRemediationUtils';
import { DevForgeGraphUpdate, DevForgeGraphStateType } from '../stateAnnotation';

export function approvalNode(state: DevForgeGraphStateType): Promise<DevForgeGraphUpdate> {
  const fixableCount = getFixableViolations(state.violations).length;

  if (fixableCount === 0) {
    return Promise.resolve({
      approved: false,
      requiresApproval: false,
      phase: 'fix',
    });
  }

  if (state.autoApprove) {
    return Promise.resolve({
      approved: true,
      requiresApproval: true,
      phase: 'fix',
    });
  }

  if (process.env.CI === 'true') {
    return Promise.resolve({
      approved: false,
      requiresApproval: true,
      phase: 'fix',
      errors: ['Auto-fix requires --yes in CI mode.'],
    });
  }

  return inquirer
    .prompt<{ approved: boolean }>([
      {
        type: 'confirm',
        name: 'approved',
        message: `Apply ${fixableCount} auto-fix(es) to workflow files?`,
        default: false,
      },
    ])
    .then(({ approved }) => ({
      approved,
      requiresApproval: true,
      phase: 'fix',
    }));
}
