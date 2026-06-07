import { ComplianceViolation } from '../security/StaticSecurityScanner';

const MANUAL_ONLY = new Set(['NIST-SI-2', 'ISO-A.9.4', 'ISO-A.12.6']);

export function isFixableViolation(violation: ComplianceViolation): boolean {
  if (MANUAL_ONLY.has(violation.controlId)) {
    return false;
  }

  if (violation.controlId === 'NIST-CM-6') {
    return true;
  }

  if (violation.controlId === 'NIST-AC-6') {
    const title = violation.title.toLowerCase();
    return title.includes('missing') || title.includes('write-all');
  }

  return false;
}

export function getFixableViolations(violations: ComplianceViolation[]): ComplianceViolation[] {
  return violations.filter(isFixableViolation);
}

export function hasFixableViolations(violations: ComplianceViolation[]): boolean {
  return getFixableViolations(violations).length > 0;
}
