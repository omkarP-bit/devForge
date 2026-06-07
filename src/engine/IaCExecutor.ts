import { spawn } from 'child_process';
import * as path from 'path';
import { IaCDetectionResult } from '../types';
import { DeploymentTarget } from '../types';
import { sanitizePath } from '../utils/sanitizer';
import { logger } from '../utils/logger';

export interface IaCExecuteResult {
  tool: string;
  success: boolean;
  exitCode: number;
  output: string;
  duration: number;
  dryRun: boolean;
  executedAt?: string;
}

const MAX_OUTPUT_LINES = 200;

export class IaCExecutor {
  constructor(
    private readonly projectRoot: string,
    private readonly dryRun: boolean,
  ) {}

  async execute(
    detection: IaCDetectionResult,
    target: DeploymentTarget, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<IaCExecuteResult> {
    if (!detection.detected || !detection.tool) {
      return this.failureResult('none', 'No IaC tool detected', 1);
    }

    switch (detection.tool) {
      case 'terraform':
        return this.executeTerraform(detection);
      case 'cdk':
        return this.executeCDK();
      case 'boto3':
        return this.executeBoto3(detection);
      case 'pulumi':
        return this.executePulumi(detection);
      default:
        return this.failureResult(detection.tool, `Unsupported IaC tool: ${detection.tool}`, 1);
    }
  }

  private async executeTerraform(detection: IaCDetectionResult): Promise<IaCExecuteResult> {
    const workDir = this.resolveTerraformDir(detection);

    if (this.dryRun) {
      const commands = [`terraform plan -out=devforge.tfplan -input=false`];
      if (!(await this.pathExists('.terraform'))) {
        commands.unshift('terraform init -input=false');
      }
      return this.dryRunResult('terraform', commands);
    }

    if (!(await this.pathExists('.terraform'))) {
      const initResult = await this.runCommand(
        'terraform',
        ['init', '-input=false'],
        workDir,
        600_000,
        'terraform',
      );
      if (!initResult.success) {
        return initResult;
      }
    }

    const planResult = await this.runCommand(
      'terraform',
      ['plan', '-out=devforge.tfplan', '-input=false'],
      workDir,
      600_000,
      'terraform',
    );
    if (!planResult.success) {
      return planResult;
    }

    return this.runCommand(
      'terraform',
      ['apply', '-auto-approve', '-input=false', 'devforge.tfplan'],
      workDir,
      600_000,
      'terraform',
    );
  }

  private async executeCDK(): Promise<IaCExecuteResult> {
    if (this.dryRun) {
      return this.dryRunResult('cdk', [
        'npx cdk diff',
        'npx cdk deploy --require-approval never --all',
      ]);
    }

    const diffResult = await this.runCommand('npx', ['cdk', 'diff'], this.projectRoot, 600_000);
    if (!diffResult.success) {
      return diffResult;
    }

    return this.runCommand(
      'npx',
      ['cdk', 'deploy', '--require-approval', 'never', '--all'],
      this.projectRoot,
      600_000,
    );
  }

  private async executeBoto3(_detection: IaCDetectionResult): Promise<IaCExecuteResult> {
    const script = _detection.entryPoints.find((entry) => entry.endsWith('.py')) ?? 'deploy.py';
    const safeScript = sanitizePath(script, this.projectRoot);
    const relativeScript = path.relative(this.projectRoot, safeScript).replace(/\\/g, '/');

    if (this.dryRun) {
      return this.dryRunResult('boto3', [`python ${relativeScript} --dry-run`]);
    }

    const dryRunResult = await this.runCommand(
      'python',
      [relativeScript, '--dry-run'],
      this.projectRoot,
      300_000,
    );
    if (dryRunResult.exitCode === 0) {
      return dryRunResult;
    }

    logger.warn('deploy.py does not support --dry-run; executing without dry-run flag.');
    return this.runCommand('python', [relativeScript], this.projectRoot, 300_000);
  }

  private async executePulumi(
    _detection: IaCDetectionResult, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<IaCExecuteResult> {
    if (this.dryRun) {
      return this.dryRunResult('pulumi', ['pulumi preview', 'pulumi up --yes']);
    }

    const previewResult = await this.runCommand('pulumi', ['preview'], this.projectRoot, 600_000);
    if (!previewResult.success) {
      return previewResult;
    }

    return this.runCommand('pulumi', ['up', '--yes'], this.projectRoot, 600_000);
  }

  private async runCommand(
    command: string,
    args: string[],
    cwd: string,
    timeoutMs: number,
    tool = command,
  ): Promise<IaCExecuteResult> {
    const safeCwd = sanitizePath(cwd, this.projectRoot);
    const started = Date.now();
    const outputLines: string[] = [];

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: IaCExecuteResult): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      };

      const child = spawn(command, args, {
        cwd: safeCwd,
        shell: process.platform === 'win32',
        env: process.env,
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
      }, timeoutMs);

      const capture = (chunk: Buffer | string): void => {
        const text = String(chunk);
        for (const line of text.split(/\r?\n/)) {
          if (!line.trim()) {
            continue;
          }
          outputLines.push(line);
          if (outputLines.length > MAX_OUTPUT_LINES) {
            outputLines.shift();
          }
          logger.info(line);
        }
      };

      child.stdout.on('data', capture);
      child.stderr.on('data', capture);

      child.on('error', (error) => {
        const message =
          (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? `${command} not found in PATH. Install the required IaC tool before deploying.`
            : error.message;
        finish({
          tool,
          success: false,
          exitCode: 127,
          output: message,
          duration: Date.now() - started,
          dryRun: this.dryRun,
        });
      });

      child.on('close', (code) => {
        const exitCode = code ?? 1;
        finish({
          tool,
          success: exitCode === 0,
          exitCode,
          output: outputLines.join('\n'),
          duration: Date.now() - started,
          dryRun: this.dryRun,
        });
      });
    });
  }

  private dryRunResult(tool: string, commands: string[]): IaCExecuteResult {
    for (const command of commands) {
      logger.info(`[dry-run] Would execute: ${command}`);
    }

    return {
      tool,
      success: true,
      exitCode: 0,
      output: commands.map((command) => `[dry-run] Would execute: ${command}`).join('\n'),
      duration: 0,
      dryRun: true,
    };
  }

  private failureResult(tool: string, message: string, exitCode: number): IaCExecuteResult {
    return {
      tool,
      success: false,
      exitCode,
      output: message,
      duration: 0,
      dryRun: this.dryRun,
    };
  }

  private resolveTerraformDir(detection: IaCDetectionResult): string {
    const tfEntry = detection.entryPoints.find((entry) => entry.endsWith('.tf'));
    if (!tfEntry) {
      return this.projectRoot;
    }

    const dir = path.posix.dirname(tfEntry.replace(/\\/g, '/'));
    if (!dir || dir === '.') {
      return this.projectRoot;
    }

    return sanitizePath(dir, this.projectRoot);
  }

  private async pathExists(relativePath: string): Promise<boolean> {
    try {
      const { access } = await import('fs/promises');
      await access(sanitizePath(relativePath, this.projectRoot));
      return true;
    } catch {
      return false;
    }
  }
}
