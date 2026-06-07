import { auditCommand } from '../../../src/cli/auditCommand';
import { TrivyRunner } from '../../../src/agent/security/TrivyRunner';

jest.mock('../../../src/agent/security/TrivyRunner');
jest.mock('../../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), success: jest.fn() },
}));
// Prevent real FS / credential operations
jest.mock('../../../src/utils/fs', () => ({
  DevForgeFS: jest.fn().mockImplementation(() => ({
    listFiles: jest.fn().mockResolvedValue([]),
    readFile: jest.fn().mockResolvedValue(''),
    fileExists: jest.fn().mockResolvedValue(false),
    writeFile: jest.fn().mockResolvedValue(undefined),
  })),
}));

const MockedRunner = TrivyRunner as jest.MockedClass<typeof TrivyRunner>;
const EMPTY_SCAN = { SchemaVersion: 2, ArtifactName: '', ArtifactType: 'filesystem' as const, Results: [] };

describe('auditCommand --trivy', () => {
  beforeEach(() => jest.clearAllMocks());

  it('exits 0 and prints install hint when Trivy not available', async () => {
    MockedRunner.prototype.isAvailable = jest.fn().mockResolvedValue(false);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await auditCommand('/tmp/proj', { trivy: true });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Trivy not found'));
    expect(process.exitCode).toBe(0);
    consoleSpy.mockRestore();
  });

  it('exits 0 when no critical findings', async () => {
    MockedRunner.prototype.isAvailable = jest.fn().mockResolvedValue(true);
    MockedRunner.prototype.scanFilesystem = jest.fn().mockResolvedValue(EMPTY_SCAN);
    MockedRunner.prototype.scanConfig = jest.fn().mockResolvedValue(EMPTY_SCAN);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await auditCommand('/tmp/proj', { trivy: true });
    expect(process.exitCode).toBe(0);
  });

  it('exits 1 when critical finding found with --fail-on critical', async () => {
    const criticalScan = {
      ...EMPTY_SCAN,
      Results: [{
        Target: 'package-lock.json',
        Class: 'lang-pkgs' as const,
        Type: 'node-pkg',
        Vulnerabilities: [{
          VulnerabilityID: 'CVE-2024-9999',
          PkgName: 'express',
          InstalledVersion: '4.17.1',
          FixedVersion: '4.21.2',
          Severity: 'CRITICAL' as const,
          Title: 'RCE',
          Description: 'desc',
          References: [],
        }],
        Misconfigurations: null,
      }],
    };
    MockedRunner.prototype.isAvailable = jest.fn().mockResolvedValue(true);
    MockedRunner.prototype.scanFilesystem = jest.fn().mockResolvedValue(criticalScan);
    MockedRunner.prototype.scanConfig = jest.fn().mockResolvedValue(EMPTY_SCAN);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await auditCommand('/tmp/proj', { trivy: true, failOn: 'critical' });
    expect(process.exitCode).toBe(1);
  });
});
