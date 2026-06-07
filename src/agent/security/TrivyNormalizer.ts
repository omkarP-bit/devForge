import { ComplianceViolation } from './StaticSecurityScanner';
import { TrivyScanResult, TrivySummary } from './trivyTypes';

const SEVERITY_MAP: Record<
  'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
  ComplianceViolation['severity']
> = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

export function normalizeTrivyResults(scanResult: TrivyScanResult): ComplianceViolation[] {
  // Map from dedup key → violation (for merging duplicate CVEs across targets)
  const merged = new Map<string, ComplianceViolation>();

  for (const result of scanResult.Results ?? []) {
    for (const vuln of result.Vulnerabilities ?? []) {
      const key = `${vuln.VulnerabilityID}::${vuln.PkgName}`;
      const existing = merged.get(key);
      if (existing) {
        if (!existing.affectedFile.includes(result.Target)) {
          existing.affectedFile += `, ${result.Target}`;
        }
      } else {
        merged.set(key, {
          controlId: vuln.VulnerabilityID,
          standard: 'NIST',
          title: vuln.Title || vuln.VulnerabilityID,
          description: `Package ${vuln.PkgName} ${vuln.InstalledVersion} is vulnerable. Fix: upgrade to ${vuln.FixedVersion || 'latest'}`,
          affectedFile: result.Target,
          severity: SEVERITY_MAP[vuln.Severity] ?? 'low',
          remediation: vuln.FixedVersion
            ? `Upgrade ${vuln.PkgName} to version ${vuln.FixedVersion} or later`
            : `No fix available yet for ${vuln.PkgName}`,
        });
      }
    }

    for (const misc of result.Misconfigurations ?? []) {
      const key = `${misc.ID}::${result.Target}`;
      if (!merged.has(key)) {
        merged.set(key, {
          controlId: misc.ID,
          standard: 'NIST',
          title: misc.Title,
          description: misc.Message,
          affectedFile: result.Target,
          severity: SEVERITY_MAP[misc.Severity] ?? 'low',
          remediation: misc.Resolution,
        });
      }
    }
  }

  return Array.from(merged.values());
}

export function getTrivySummary(violations: ComplianceViolation[]): TrivySummary {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  const pkgCount = new Map<string, number>();
  let fixableCount = 0;

  for (const v of violations) {
    counts[v.severity] = (counts[v.severity] ?? 0) + 1;
    // fixable violations have a FixedVersion in the remediation text ("Upgrade X to version Y")
    if (v.remediation.startsWith('Upgrade ')) fixableCount++;
    // extract package name from description: "Package <name> ..."
    const match = v.description.match(/^Package (\S+)/);
    if (match?.[1]) {
      pkgCount.set(match[1], (pkgCount.get(match[1]) ?? 0) + 1);
    }
  }

  const topPackages = [...pkgCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  return {
    totalVulnerabilities: violations.length,
    ...counts,
    fixableCount,
    topPackages,
  };
}
