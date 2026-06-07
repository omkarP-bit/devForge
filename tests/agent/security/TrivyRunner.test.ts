import { execFile } from 'child_process';
import { TrivyRunner } from '../../../src/agent/security/TrivyRunner';

jest.mock('child_process', () => ({ execFile: jest.fn() }));

const mockedExecFile = execFile as jest.MockedFunction<typeof execFile>;

function mockExecFile(err: Error | null, stdout: string) {
  mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
    (callback as (err: Error | null, stdout: string, stderr: string) => void)(err, stdout, '');
    return {} as ReturnType<typeof execFile>;
  });
}

const MOCK_RESULT = {
  SchemaVersion: 2,
  ArtifactName: 'test',
  ArtifactType: 'filesystem' as const,
  Results: [],
};

describe('TrivyRunner', () => {
  let runner: TrivyRunner;

  beforeEach(() => {
    runner = new TrivyRunner();
    jest.clearAllMocks();
  });

  describe('isAvailable', () => {
    it('returns true when trivy exits 0', async () => {
      mockExecFile(null, 'Version: 0.50.0');
      expect(await runner.isAvailable()).toBe(true);
    });

    it('returns false when trivy not found', async () => {
      mockExecFile(new Error('spawn trivy ENOENT'), '');
      expect(await runner.isAvailable()).toBe(false);
    });

    it('never throws', async () => {
      mockedExecFile.mockImplementation(() => { throw new Error('unexpected'); });
      await expect(runner.isAvailable()).resolves.toBe(false);
    });
  });

  describe('scanFilesystem', () => {
    it('parses stdout as TrivyScanResult', async () => {
      mockExecFile(null, JSON.stringify(MOCK_RESULT));
      const result = await runner.scanFilesystem('/tmp/project');
      expect(result.SchemaVersion).toBe(2);
    });

    it('passes --scanners vuln,secret in args', async () => {
      mockExecFile(null, JSON.stringify(MOCK_RESULT));
      await runner.scanFilesystem('/tmp/project');
      const args = (mockedExecFile.mock.calls[0] as unknown[])[1] as string[];
      expect(args).toContain('--scanners');
      expect(args).toContain('vuln,secret');
    });
  });

  describe('scanImage', () => {
    it('includes image name in args', async () => {
      mockExecFile(null, JSON.stringify(MOCK_RESULT));
      await runner.scanImage('node:20-slim');
      const args = (mockedExecFile.mock.calls[0] as unknown[])[1] as string[];
      expect(args).toContain('node:20-slim');
    });
  });

  describe('scanConfig', () => {
    it('calls trivy config with workflow dir', async () => {
      mockExecFile(null, JSON.stringify(MOCK_RESULT));
      await runner.scanConfig('.github/workflows');
      const args = (mockedExecFile.mock.calls[0] as unknown[])[1] as string[];
      expect(args[0]).toBe('config');
    });
  });
});
