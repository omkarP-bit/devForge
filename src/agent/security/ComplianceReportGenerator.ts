import { DevForgeConfig } from '../../types';
import { DevForgeFS } from '../../utils/fs';
import { logger } from '../../utils/logger';
import { ComplianceViolation } from './StaticSecurityScanner';
import { TrivySummary } from './trivyTypes';

const REPORT_PATH = 'COMPLIANCE_REPORT.md';

const SEVERITY_ORDER: ComplianceViolation['severity'][] = ['critical', 'high', 'medium', 'low'];

const ALL_CONTROLS = [
  { id: 'NIST-AC-6', label: 'NIST SP 800-53 AC-6 — Least Privilege' },
  { id: 'NIST-SI-2', label: 'NIST SP 800-53 SI-2 — Flaw Remediation / Integrity' },
  { id: 'NIST-CM-6', label: 'NIST SP 800-53 CM-6 — Configuration Settings' },
  { id: 'ISO-A.9.4', label: 'ISO 27001 Annex A.9.4 — Access Control' },
  { id: 'ISO-A.12.6', label: 'ISO 27001 Annex A.12.6 — Vulnerability Management' },
];

export async function generateComplianceReport(
  violations: ComplianceViolation[],
  config: DevForgeConfig,
  fs: DevForgeFS,
  trivyViolations?: ComplianceViolation[],
  trivySummary?: TrivySummary | null,
): Promise<void> {
  if (await fs.fileExists(REPORT_PATH)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `COMPLIANCE_REPORT_${ts}.md.bak`;
    const existing = await fs.readFile(REPORT_PATH);
    await fs.writeFile(backupPath, existing);
  }

  const report = buildReport(violations, config, trivyViolations, trivySummary);
  await fs.writeFile(REPORT_PATH, report);
  logger.success('✓ Compliance report written to COMPLIANCE_REPORT.md');
}

function buildReport(
  violations: ComplianceViolation[],
  config: DevForgeConfig,
  trivyViolations?: ComplianceViolation[],
  trivySummary?: TrivySummary | null,
): string {
  const now = new Date().toISOString();
  const framework = config.detected.framework;
  const target = config.user.deploymentTarget;
  const riskScore = computeRiskScore(violations);

  const counts = countBySeverity(violations);
  const sorted = [...violations].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
  const violatedIds = new Set(violations.map((v) => v.controlId));

  const lines: string[] = [
    '# DevForge Security & Compliance Report',
    '',
    `**Generated:** ${now}`,
    `**Project:** ${framework} → ${target}`,
    `**Risk Score:** ${riskScore}/100`,
    '',
    '## Executive Summary',
    '',
    '| Severity | Count |',
    '|----------|-------|',
    `| Critical | ${counts.critical} |`,
    `| High     | ${counts.high}     |`,
    `| Medium   | ${counts.medium}   |`,
    `| Low      | ${counts.low}      |`,
    '',
    '## Violations',
    '',
  ];

  if (sorted.length === 0) {
    lines.push('_No violations detected._', '');
  } else {
    for (const v of sorted) {
      const standardLabel = v.standard === 'NIST' ? 'NIST SP 800-53' : 'ISO 27001 Annex A';
      lines.push(
        `### [${v.severity.toUpperCase()}] ${v.controlId} — ${v.title}`,
        '',
        `**File:** ${v.affectedFile}`,
        `**Standard:** ${standardLabel}`,
        `**Description:** ${v.description}`,
        `**Remediation:** ${v.remediation}`,
        '',
      );
    }
  }

  lines.push('## Controls Checked', '');
  for (const ctrl of ALL_CONTROLS) {
    const status = violatedIds.has(ctrl.id) ? '❌ FAIL' : '✅ PASS';
    lines.push(`- ${status} — ${ctrl.label}`);
  }
  lines.push('');

  const critical = sorted.filter((v) => v.severity === 'critical' || v.severity === 'high');
  if (critical.length > 0) {
    lines.push('## How to Fix', '');
    critical.forEach((v, i) => {
      lines.push(
        `### Step ${i + 1}: Fix \`${v.controlId}\` in \`${v.affectedFile}\``,
        '',
        v.remediation,
        '',
      );
    });
  }

  if (trivyViolations && trivyViolations.length > 0) {
    lines.push('## Trivy Vulnerability Scan', '');
    if (trivySummary) {
      lines.push(
        `**Total:** ${trivySummary.totalVulnerabilities} | ` +
          `Critical: ${trivySummary.critical} | High: ${trivySummary.high} | ` +
          `Medium: ${trivySummary.medium} | Low: ${trivySummary.low} | ` +
          `Fixable: ${trivySummary.fixableCount}`,
        '',
      );
    }

    const criticalHighTrivy = trivyViolations.filter(
      (v) => v.severity === 'critical' || v.severity === 'high',
    );

    if (criticalHighTrivy.length > 0) {
      lines.push(
        '| CVE ID | Package | Installed | Fix Version | Severity |',
        '|--------|---------|-----------|-------------|----------|',
      );
      for (const v of criticalHighTrivy) {
        const match = v.description.match(
          /^Package (\S+) (\S+) is vulnerable\. Fix: upgrade to (\S+)/,
        );
        const pkg = match?.[1] ?? v.affectedFile;
        const installed = match?.[2] ?? '-';
        const fixVersion = match?.[3] ?? '-';
        lines.push(
          `| ${v.controlId} | ${pkg} | ${installed} | ${fixVersion} | ${v.severity.toUpperCase()} |`,
        );
      }
      lines.push('');
    }

    const medLow = trivyViolations.filter((v) => v.severity === 'medium' || v.severity === 'low');
    if (medLow.length > 0) {
      lines.push(
        '<details><summary>Medium/Low findings (' + medLow.length + ')</summary>',
        '',
        '| CVE ID | Package | Severity |',
        '|--------|---------|----------|',
      );
      for (const v of medLow) {
        const match = v.description.match(/^Package (\S+)/);
        const pkg = match?.[1] ?? v.affectedFile;
        lines.push(`| ${v.controlId} | ${pkg} | ${v.severity.toUpperCase()} |`);
      }
      lines.push('', '</details>', '');
    }
  } else if (trivyViolations) {
    lines.push('## Trivy Vulnerability Scan', '', '_No vulnerabilities found._', '');
  }

  return lines.join('\n');
}

function countBySeverity(
  violations: ComplianceViolation[],
): Record<ComplianceViolation['severity'], number> {
  return violations.reduce(
    (acc, v) => {
      acc[v.severity]++;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0 },
  );
}

function computeRiskScore(violations: ComplianceViolation[]): number {
  if (violations.length === 0) return 0;
  const weights: Record<ComplianceViolation['severity'], number> = {
    critical: 40,
    high: 20,
    medium: 10,
    low: 5,
  };
  const raw = violations.reduce((sum, v) => sum + weights[v.severity], 0);
  return Math.min(100, raw);
}
