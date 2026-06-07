import { normalizeTrivyResults, getTrivySummary } from '../../../src/agent/security/TrivyNormalizer';
import { TrivyScanResult } from '../../../src/agent/security/trivyTypes';

const BASE_SCAN: TrivyScanResult = {
  SchemaVersion: 2,
  ArtifactName: 'test',
  ArtifactType: 'filesystem',
  Results: [
    {
      Target: 'package-lock.json',
      Class: 'lang-pkgs',
      Type: 'node-pkg',
      Vulnerabilities: [
        {
          VulnerabilityID: 'CVE-2023-0001',
          PkgName: 'express',
          InstalledVersion: '4.17.1',
          FixedVersion: '4.21.2',
          Severity: 'CRITICAL',
          Title: 'RCE in express',
          Description: 'Remote code execution',
          References: [],
        },
      ],
      Misconfigurations: null,
    },
  ],
};

describe('normalizeTrivyResults', () => {
  it('maps vulnerability to ComplianceViolation', () => {
    const violations = normalizeTrivyResults(BASE_SCAN);
    expect(violations).toHaveLength(1);
    const v = violations[0]!;
    expect(v.controlId).toBe('CVE-2023-0001');
    expect(v.standard).toBe('NIST');
    expect(v.severity).toBe('critical');
    expect(v.affectedFile).toBe('package-lock.json');
    expect(v.remediation).toContain('4.21.2');
  });

  it('maps CRITICAL→critical, HIGH→high, MEDIUM→medium, LOW→low', () => {
    const result = normalizeTrivyResults({
      ...BASE_SCAN,
      Results: [
        {
          Target: 't',
          Class: 'lang-pkgs',
          Type: 'pip',
          Vulnerabilities: [
            { VulnerabilityID: 'CVE-A', PkgName: 'a', InstalledVersion: '1', FixedVersion: '2', Severity: 'HIGH', Title: 'T', Description: 'D', References: [] },
            { VulnerabilityID: 'CVE-B', PkgName: 'b', InstalledVersion: '1', FixedVersion: '', Severity: 'MEDIUM', Title: 'T', Description: 'D', References: [] },
            { VulnerabilityID: 'CVE-C', PkgName: 'c', InstalledVersion: '1', FixedVersion: '', Severity: 'LOW', Title: 'T', Description: 'D', References: [] },
          ],
          Misconfigurations: null,
        },
      ],
    });
    expect(result.map((v) => v.severity)).toEqual(['high', 'medium', 'low']);
  });

  it('deduplicates same CVE across targets, merges affectedFile', () => {
    const scan: TrivyScanResult = {
      ...BASE_SCAN,
      Results: [
        {
          Target: 'package-lock.json',
          Class: 'lang-pkgs',
          Type: 'node-pkg',
          Vulnerabilities: [BASE_SCAN.Results[0]!.Vulnerabilities![0]!],
          Misconfigurations: null,
        },
        {
          Target: 'node:20-slim (ubuntu 22.04)',
          Class: 'os-pkgs',
          Type: 'ubuntu',
          Vulnerabilities: [BASE_SCAN.Results[0]!.Vulnerabilities![0]!],
          Misconfigurations: null,
        },
      ],
    };
    const violations = normalizeTrivyResults(scan);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.affectedFile).toContain('package-lock.json');
    expect(violations[0]!.affectedFile).toContain('node:20-slim (ubuntu 22.04)');
  });

  it('maps misconfiguration to ComplianceViolation', () => {
    const scan: TrivyScanResult = {
      ...BASE_SCAN,
      Results: [
        {
          Target: 'Dockerfile',
          Class: 'config',
          Type: 'dockerfile',
          Vulnerabilities: null,
          Misconfigurations: [
            { Type: 'Dockerfile', ID: 'DS026', Title: 'No USER', Severity: 'HIGH', Message: 'No user set', Resolution: 'Add USER instruction' },
          ],
        },
      ],
    };
    const violations = normalizeTrivyResults(scan);
    expect(violations[0]!.controlId).toBe('DS026');
    expect(violations[0]!.remediation).toBe('Add USER instruction');
  });
});

describe('getTrivySummary', () => {
  it('counts by severity and computes fixable', () => {
    const violations = normalizeTrivyResults(BASE_SCAN);
    const summary = getTrivySummary(violations);
    expect(summary.critical).toBe(1);
    expect(summary.fixableCount).toBe(1);
    expect(summary.totalVulnerabilities).toBe(1);
  });

  it('returns top packages sorted by frequency', () => {
    const violations = normalizeTrivyResults({
      ...BASE_SCAN,
      Results: [
        {
          Target: 'package-lock.json',
          Class: 'lang-pkgs',
          Type: 'node-pkg',
          Vulnerabilities: [
            { VulnerabilityID: 'CVE-1', PkgName: 'lodash', InstalledVersion: '1', FixedVersion: '2', Severity: 'HIGH', Title: 'T', Description: 'D', References: [] },
            { VulnerabilityID: 'CVE-2', PkgName: 'lodash', InstalledVersion: '1', FixedVersion: '2', Severity: 'MEDIUM', Title: 'T', Description: 'D', References: [] },
            { VulnerabilityID: 'CVE-3', PkgName: 'express', InstalledVersion: '1', FixedVersion: '2', Severity: 'LOW', Title: 'T', Description: 'D', References: [] },
          ],
          Misconfigurations: null,
        },
      ],
    });
    const summary = getTrivySummary(violations);
    expect(summary.topPackages[0]).toBe('lodash');
  });
});
