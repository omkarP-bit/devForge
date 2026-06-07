import {
  getFixableViolations,
  hasFixableViolations,
} from '../../../src/agent/graph/securityRemediationUtils';
import { ComplianceViolation } from '../../../src/agent/security/StaticSecurityScanner';

function violation(controlId: string, title: string): ComplianceViolation {
  return {
    controlId,
    standard: 'NIST',
    title,
    description: 'desc',
    affectedFile: '.github/workflows/ci.yml',
    severity: 'high',
    remediation: 'fix it',
  };
}

describe('securityRemediationUtils', () => {
  it('detects fixable NIST-AC-6 and NIST-CM-6 violations', () => {
    const violations = [
      violation('NIST-AC-6', 'missing permissions block'),
      violation('NIST-CM-6', 'latest docker tag'),
      violation('NIST-SI-2', 'manual only'),
    ];

    expect(hasFixableViolations(violations)).toBe(true);
    expect(getFixableViolations(violations)).toHaveLength(2);
  });

  it('returns false when only manual violations exist', () => {
    const violations = [violation('ISO-A.9.4', 'manual')];
    expect(hasFixableViolations(violations)).toBe(false);
  });
});
