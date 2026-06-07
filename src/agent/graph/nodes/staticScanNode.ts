import { runStaticScan } from '../../security/StaticSecurityScanner';
import { AgentResult } from '../../types';
import { createReadFile } from '../dependencies';
import { DevForgeGraphUpdate, DevForgeGraphStateType } from '../stateAnnotation';
import { DevForgeFS } from '../../../utils/fs';

export interface StaticScanNodeContext {
  fs: DevForgeFS;
}

export function createStaticScanNode(context: StaticScanNodeContext) {
  const readFile = createReadFile(context.fs);

  return async function staticScanNode(state: DevForgeGraphStateType): Promise<DevForgeGraphUpdate> {
    const fileContents: Record<string, string> = {};

    for (const filePath of state.context.generatedFiles) {
      try {
        // eslint-disable-next-line security/detect-object-injection
        fileContents[filePath] = await readFile(filePath);
      } catch {
        // skip unreadable files
      }
    }

    const violations = runStaticScan(fileContents);
    const securityResult: AgentResult = {
      agentName: 'SecurityComplianceAgent',
      success: true,
      messages: violations.length
        ? [{ type: 'warn', text: `${violations.length} compliance violation(s) found (static scan).` }]
        : [{ type: 'info', text: 'No compliance violations detected (static scan).' }],
      expectedOutputs: [],
      recommendations: violations.map((violation) => ({
        type: 'security',
        severity: violation.severity,
        title: `[${violation.controlId}] ${violation.title}`,
        description: `${violation.description} — ${violation.remediation}`,
        autoFixAvailable: false,
      })),
      warnings: [],
    };

    return {
      securityResult,
      violations,
      phase: 'security',
    };
  };
}
