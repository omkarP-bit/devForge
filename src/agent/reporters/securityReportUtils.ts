import { Recommendation } from '../types';
import { ComplianceViolation } from '../security/StaticSecurityScanner';
import { printSecurityReport } from './SecurityReporter';

export function violationsFromRecommendations(
  recommendations: Recommendation[],
  fallbackFile: string,
): ComplianceViolation[] {
  return recommendations.map((recommendation) => {
    const controlId = recommendation.title.match(/\[([^\]]+)\]/)?.[1] ?? 'UNKNOWN';
    const standard: ComplianceViolation['standard'] = controlId.startsWith('ISO')
      ? 'ISO27001'
      : 'NIST';

    return {
      controlId,
      standard,
      title: recommendation.title.replace(/^\[[^\]]+\]\s*/, ''),
      description: recommendation.description,
      affectedFile: fallbackFile,
      severity: recommendation.severity,
      remediation: recommendation.description.split(' — ').pop() ?? '',
    };
  });
}

export function computeRiskScore(violations: ComplianceViolation[]): number {
  if (violations.length === 0) {
    return 0;
  }

  if (violations.some((violation) => violation.severity === 'critical')) {
    return 90;
  }

  if (violations.some((violation) => violation.severity === 'high')) {
    return 60;
  }

  return 30;
}

export function reportSecurityAgentResult(
  result: { recommendations: Recommendation[] },
  fallbackFile: string,
): void {
  const violations = violationsFromRecommendations(result.recommendations, fallbackFile);
  const riskScore = computeRiskScore(violations);
  printSecurityReport(violations, riskScore);
}
