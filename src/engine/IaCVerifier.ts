import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { IaCGenerationOutput, IaCVerifyResult, IaCVerifyError } from '../types';
import { logger } from '../utils/logger';

const execFile = promisify(execFileCb);

const TIMEOUTS = {
  terraform: 60_000,
  cdk: 120_000,
  boto3: 30_000,
} as const;

export class IaCVerifier {
  constructor(private readonly projectRoot: string) {}

  async verify(output: IaCGenerationOutput, tempDir: string): Promise<IaCVerifyResult> {
    switch (output.tool) {
      case 'terraform':
        return this.verifyTerraform(output, tempDir);
      case 'cdk':
        return this.verifyCDK(output, tempDir);
      case 'boto3':
        return this.verifyBoto3(output, tempDir);
    }
  }

  static async createTempDir(): Promise<string> {
    const dir = path.join(os.tmpdir(), `devforge-iac-verify-${randomUUID()}`);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  static async cleanupTempDir(tempDir: string): Promise<void> {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }

  private async verifyTerraform(
    output: IaCGenerationOutput,
    tempDir: string,
  ): Promise<IaCVerifyResult> {
    await this.writeFiles(output, tempDir);

    const initResult = await this.runCommand(
      'terraform',
      ['init', '-backend=false', '-input=false'],
      tempDir,
      TIMEOUTS.terraform,
    );
    if (!initResult.passed) {
      return this.buildResult('terraform', initResult.errors);
    }

    const validateResult = await this.runCommand(
      'terraform',
      ['validate'],
      tempDir,
      TIMEOUTS.terraform,
    );
    if (!validateResult.passed) {
      return this.buildResult('terraform', validateResult.errors);
    }

    const fmtResult = await this.runCommand(
      'terraform',
      ['fmt', '-check', '-recursive'],
      tempDir,
      TIMEOUTS.terraform,
    );

    return {
      tool: 'terraform',
      passed: true,
      errors: [],
      warnings: fmtResult.passed
        ? []
        : [{ file: 'infra/', message: 'Terraform formatting check failed — run terraform fmt' }],
      verifiedAt: new Date().toISOString(),
    };
  }

  private async verifyCDK(
    output: IaCGenerationOutput,
    tempDir: string,
  ): Promise<IaCVerifyResult> {
    await this.writeFiles(output, tempDir);

    const hasPackageJson = output.files.some((f) => f.relativePath.endsWith('package.json'));
    if (hasPackageJson) {
      const npmResult = await this.runCommand(
        'npm',
        ['install', '--prefer-offline', '--no-audit'],
        tempDir,
        TIMEOUTS.cdk,
      );
      if (!npmResult.passed) {
        return this.buildResult('cdk', npmResult.errors);
      }
    }

    const synthResult = await this.runCommand(
      'npx',
      ['cdk', 'synth', '--quiet'],
      tempDir,
      TIMEOUTS.cdk,
    );

    return this.buildResult('cdk', synthResult.errors, synthResult.passed);
  }

  private async verifyBoto3(
    output: IaCGenerationOutput,
    tempDir: string,
  ): Promise<IaCVerifyResult> {
    await this.writeFiles(output, tempDir);

    const pyFiles = output.files.filter((f) => f.relativePath.endsWith('.py'));
    const errors: IaCVerifyError[] = [];

    for (const file of pyFiles) {
      const absPath = path.join(tempDir, file.relativePath);
      const result = await this.runCommand(
        'python',
        ['-m', 'py_compile', absPath],
        tempDir,
        TIMEOUTS.boto3,
      );
      if (!result.passed) {
        errors.push(...result.errors);
      }
    }

    if (errors.length > 0) {
      return this.buildResult('boto3', errors);
    }

    // Optional pylint pass — skip gracefully if not installed
    for (const file of pyFiles) {
      const absPath = path.join(tempDir, file.relativePath);
      try {
        await this.runCommand(
          'pylint',
          ['--errors-only', absPath],
          tempDir,
          TIMEOUTS.boto3,
        );
      } catch {
        // pylint not installed — not fatal
      }
    }

    return this.buildResult('boto3', [], true);
  }

  private async writeFiles(output: IaCGenerationOutput, tempDir: string): Promise<void> {
    for (const file of output.files) {
      const absPath = path.join(tempDir, file.relativePath);
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, file.content, 'utf-8');
    }
  }

  private async runCommand(
    command: string,
    args: string[],
    cwd: string,
    timeoutMs: number,
  ): Promise<{ passed: boolean; errors: IaCVerifyError[] }> {
    try {
      await execFile(command, args, {
        cwd,
        timeout: timeoutMs,
        shell: process.platform === 'win32',
      });
      return { passed: true, errors: [] };
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string };

      if (err.code === 'ENOENT') {
        return {
          passed: false,
          errors: [
            {
              file: '',
              message: `${command} not found in PATH. Install the required tool before verification.`,
              fatal: true,
            },
          ],
        };
      }

      const output = [err.stderr ?? '', err.stdout ?? ''].filter(Boolean).join('\n').trim();
      logger.warn(`IaCVerifier [${command}]: ${output}`);

      return {
        passed: false,
        errors: [
          {
            file: args[args.length - 1] ?? '',
            message: output || `${command} exited with error`,
            fatal: true,
          },
        ],
      };
    }
  }

  private buildResult(
    tool: string,
    errors: IaCVerifyError[],
    passed?: boolean,
  ): IaCVerifyResult {
    return {
      tool,
      passed: passed ?? errors.length === 0,
      errors,
      warnings: [],
      verifiedAt: new Date().toISOString(),
    };
  }
}
