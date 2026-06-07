jest.mock('child_process');
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cp = require('child_process') as { execFile: jest.Mock };

import * as fs from 'fs/promises';
import * as path from 'path';
import { IaCVerifier } from '../../src/engine/IaCVerifier';
import { IaCGenerationOutput } from '../../src/types';

function fakeExec(cb: (...a: unknown[]) => void, err?: Error, stdout = 'ok', stderr = '') {
  cb(err ?? null, stdout, stderr);
}

function mockSuccess() {
  cp.execFile.mockImplementation(
    (_c: unknown, _a: unknown, _o: unknown, cb: (...a: unknown[]) => void) => {
      fakeExec(cb);
      return {};
    },
  );
}

function mockFailure(msg: string) {
  cp.execFile.mockImplementation(
    (_c: unknown, _a: unknown, _o: unknown, cb: (...a: unknown[]) => void) => {
      const err = Object.assign(new Error(msg), { stderr: msg, stdout: '' });
      fakeExec(cb, err, '', msg);
      return {};
    },
  );
}

function mockNotFound() {
  cp.execFile.mockImplementation(
    (_c: unknown, _a: unknown, _o: unknown, cb: (...a: unknown[]) => void) => {
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      fakeExec(cb, err);
      return {};
    },
  );
}

const terraformOutput: IaCGenerationOutput = {
  tool: 'terraform',
  files: [
    { relativePath: 'infra/main.tf', content: 'resource "aws_ecs_cluster" "app" { name = "app" }', description: 'main' },
    { relativePath: 'infra/variables.tf', content: 'variable "region" { default = "us-east-1" }', description: 'vars' },
  ],
  installInstructions: ['terraform init'],
  notes: [],
};

const cdkOutput: IaCGenerationOutput = {
  tool: 'cdk',
  files: [
    { relativePath: 'infra/lib/ecr-stack.ts', content: 'export class EcrStack {}', description: 'ECR stack' },
    { relativePath: 'infra/package.json', content: '{"name":"infra"}', description: 'package.json' },
  ],
  installInstructions: ['npm install'],
  notes: [],
};

const boto3Output: IaCGenerationOutput = {
  tool: 'boto3',
  files: [
    { relativePath: 'scripts/deploy.py', content: 'import boto3\nprint("deploy")', description: 'deploy' },
  ],
  installInstructions: ['pip install boto3'],
  notes: [],
};

describe('IaCVerifier', () => {
  let tempDir: string;
  let verifier: IaCVerifier;

  beforeEach(async () => {
    tempDir = await IaCVerifier.createTempDir();
    verifier = new IaCVerifier('/tmp/project');
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await IaCVerifier.cleanupTempDir(tempDir);
    jest.resetAllMocks();
  });

  describe('createTempDir / cleanupTempDir', () => {
    it('creates a directory with devforge prefix', async () => {
      const dir = await IaCVerifier.createTempDir();
      expect(dir).toContain('devforge-iac-verify-');
      const stat = await fs.stat(dir);
      expect(stat.isDirectory()).toBe(true);
      await IaCVerifier.cleanupTempDir(dir);
    });

    it('cleanup is idempotent on missing dir', async () => {
      await expect(IaCVerifier.cleanupTempDir('/tmp/nonexistent-devforge-dir')).resolves.not.toThrow();
    });
  });

  describe('verify() – terraform', () => {
    it('returns passed=true when all terraform commands succeed', async () => {
      mockSuccess();
      const result = await verifier.verify(terraformOutput, tempDir);
      expect(result.tool).toBe('terraform');
      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.verifiedAt).toBeTruthy();
    });

    it('returns passed=false when terraform init fails', async () => {
      mockFailure('Error: no suitable version constraint');
      const result = await verifier.verify(terraformOutput, tempDir);
      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.fatal).toBe(true);
    });

    it('returns passed=false with "not found in PATH" when terraform missing', async () => {
      mockNotFound();
      const result = await verifier.verify(terraformOutput, tempDir);
      expect(result.passed).toBe(false);
      expect(result.errors[0]?.message).toContain('not found in PATH');
    });

    it('writes .tf files to tempDir', async () => {
      mockSuccess();
      await verifier.verify(terraformOutput, tempDir);
      const mainTf = await fs.readFile(path.join(tempDir, 'infra/main.tf'), 'utf-8');
      expect(mainTf).toContain('aws_ecs_cluster');
    });

    it('fmt failure produces warning but passed=true', async () => {
      let n = 0;
      cp.execFile.mockImplementation(
        (_c: unknown, _a: unknown, _o: unknown, cb: (...a: unknown[]) => void) => {
          n++;
          if (n <= 2) {
            fakeExec(cb);
          } else {
            const err = Object.assign(new Error('fmt diff'), { stderr: 'fmt diff', stdout: '' });
            fakeExec(cb, err, '', 'fmt diff');
          }
          return {};
        },
      );
      const result = await verifier.verify(terraformOutput, tempDir);
      expect(result.passed).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]?.message).toContain('terraform fmt');
    });
  });

  describe('verify() – cdk', () => {
    it('returns passed=true when npm install and cdk synth succeed', async () => {
      mockSuccess();
      const result = await verifier.verify(cdkOutput, tempDir);
      expect(result.tool).toBe('cdk');
      expect(result.passed).toBe(true);
    });

    it('returns passed=false when npm install fails', async () => {
      mockFailure('npm ERR! code ENOTFOUND');
      const result = await verifier.verify(cdkOutput, tempDir);
      expect(result.passed).toBe(false);
    });

    it('returns passed=false when npm not in PATH', async () => {
      mockNotFound();
      const result = await verifier.verify(cdkOutput, tempDir);
      expect(result.passed).toBe(false);
      expect(result.errors[0]?.message).toContain('not found in PATH');
    });

    it('skips npm install when no package.json in generated files', async () => {
      mockSuccess();
      const noPkg: IaCGenerationOutput = {
        ...cdkOutput,
        files: cdkOutput.files.filter((f: { relativePath: string }) => !f.relativePath.endsWith('package.json')),
      };
      const result = await verifier.verify(noPkg, tempDir);
      expect(cp.execFile).toHaveBeenCalledTimes(1);
      expect(result.passed).toBe(true);
    });
  });

  describe('verify() – boto3', () => {
    it('returns passed=true when py_compile succeeds', async () => {
      mockSuccess();
      const result = await verifier.verify(boto3Output, tempDir);
      expect(result.tool).toBe('boto3');
      expect(result.passed).toBe(true);
    });

    it('returns passed=false when py_compile fails', async () => {
      mockFailure('SyntaxError: invalid syntax (deploy.py, line 1)');
      const result = await verifier.verify(boto3Output, tempDir);
      expect(result.passed).toBe(false);
      expect(result.errors[0]?.message).toContain('SyntaxError');
    });

    it('returns passed=false when python not in PATH', async () => {
      mockNotFound();
      const result = await verifier.verify(boto3Output, tempDir);
      expect(result.passed).toBe(false);
      expect(result.errors[0]?.message).toContain('not found in PATH');
    });

    it('writes python files to tempDir', async () => {
      mockSuccess();
      await verifier.verify(boto3Output, tempDir);
      const deployPy = await fs.readFile(path.join(tempDir, 'scripts/deploy.py'), 'utf-8');
      expect(deployPy).toContain('import boto3');
    });
  });
});
