import Table from 'cli-table3';
import path from 'path';
import { DevForgeFS } from '../utils/fs';
import { SecurityComplianceAgent } from '../agent/agents/SecurityComplianceAgent';
import { createAgentCache } from '../agent/cache/createAgentCache';
import { CredentialManager } from '../agent/credentials';
import { StoredCredentials } from '../agent/credentials/types';
import { resolveProvider } from '../agent/providers/ProviderFactory';
import { LLMProvider } from '../agent/providers/types';
import { AgentRuntime } from '../agent/AgentRuntime';
import { AgentContext } from '../agent/types';
import { printSecurityReport } from '../agent/reporters/SecurityReporter';
import { generateComplianceReport } from '../agent/security/ComplianceReportGenerator';
import { applyAutoFixes } from '../agent/security/AutoFixEngine';
import {
  DevForgeConfig,
  Framework,
  PackageManager,
  DeploymentTarget,
  BranchStrategy,
} from '../types';
import { logger } from '../utils/logger';

export type AuditLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface AuditIssue {
  code: string;
  level: AuditLevel;
  message: string;
}

export interface AuditReport {
  filePath: string;
  issues: AuditIssue[];
}

interface AuditOptions {
  fix?: boolean;
  security?: boolean;
}

const TRUSTED_ACTION_PREFIXES = ['actions/', 'docker/', './', 'github/'];

export async function auditCommand(projectRoot: string, options: AuditOptions = {}): Promise<void> {
  if (options.security) {
    await runSecurityAudit(projectRoot, options);
    return;
  }

  const fs = new DevForgeFS(projectRoot);
  const workflowRoot = '.github/workflows';
  const workflowFiles = await collectWorkflowFiles(fs, workflowRoot);

  if (workflowFiles.length === 0) {
    console.log('No workflow YAML files found under .github/workflows/.');
    if (options.fix) {
      console.log('Auto-fix is not yet implemented. See the issues above and fix manually.');
    }
    process.exitCode = 0;
    return;
  }

  const reports: AuditReport[] = [];
  for (const filePath of workflowFiles) {
    const content = await fs.readFile(filePath);
    reports.push({ filePath, issues: auditWorkflowContent(content, filePath) });
  }

  let hasCritical = false;
  let hasHigh = false;

  for (const report of reports) {
    const counts = summarizeIssues(report.issues);
    if (counts.CRITICAL > 0) hasCritical = true;
    if (counts.HIGH > 0) hasHigh = true;

    console.log(`\n${path.basename(report.filePath)} — ${formatSummary(counts)}`);

    const table = new Table({
      head: ['Code', 'Level', 'Message'],
      style: { head: ['cyan'] },
      colWidths: [8, 12, 90],
      wordWrap: true,
    });

    if (report.issues.length === 0) {
      table.push(['OK', 'INFO', 'No issues found']);
    } else {
      for (const issue of report.issues) {
        table.push([issue.code, issue.level, issue.message]);
      }
    }

    console.log(table.toString());
  }

  if (options.fix) {
    console.log('Auto-fix is not yet implemented. See the issues above and fix manually.');
  }

  process.exitCode = hasCritical ? 1 : hasHigh ? 2 : 0;
}

export function auditWorkflowContent(content: string, filePath: string): AuditIssue[] {
  const issues: AuditIssue[] = [];

  if (hasHardcodedCredential(content)) {
    issues.push({
      code: 'S1',
      level: 'CRITICAL',
      message: `Possible hardcoded credential in ${filePath}`,
    });
  }

  if (hasUnpinnedCheckout(content)) {
    issues.push({
      code: 'S2',
      level: 'HIGH',
      message: 'actions/checkout is not pinned to a version',
    });
  }

  if (!/permissions\s*:/i.test(content)) {
    issues.push({
      code: 'S3',
      level: 'MEDIUM',
      message: 'Workflow is missing a permissions block',
    });
  }

  if (/pull_request_target/i.test(content) && /permissions:[\s\S]*\bwrite\b/i.test(content)) {
    issues.push({
      code: 'S4',
      level: 'CRITICAL',
      message: 'pull_request_target with write permissions can expose secrets',
    });
  }

  if (hasSecretsPassedToUntrustedAction(content)) {
    issues.push({
      code: 'S5',
      level: 'HIGH',
      message: 'Secrets appear to be passed to an untrusted external action',
    });
  }

  if (!/cache\s*:/i.test(content) && /setup-node/i.test(content)) {
    issues.push({
      code: 'P1',
      level: 'MEDIUM',
      message: 'No dependency caching detected',
    });
  }

  if (/npm\s+install\b/i.test(content) && !/npm\s+ci\b/i.test(content)) {
    issues.push({
      code: 'P2',
      level: 'LOW',
      message: 'Use npm ci instead of npm install in CI',
    });
  }

  if (/build/i.test(content) && !/upload-artifact/i.test(content)) {
    issues.push({
      code: 'P3',
      level: 'INFO',
      message: 'No artifact upload step detected for build outputs',
    });
  }

  if (!/timeout-minutes\s*:/i.test(content)) {
    issues.push({
      code: 'B1',
      level: 'LOW',
      message: 'No timeout-minutes configured for jobs',
    });
  }

  if (/node-version\s*:\s*['"]?\d+['"]?/i.test(content) && !/matrix\s*:/i.test(content)) {
    issues.push({
      code: 'B2',
      level: 'INFO',
      message: 'Hardcoded node-version detected instead of a matrix',
    });
  }

  if (!/concurrency\s*:/i.test(content) || !/cancel-in-progress\s*:/i.test(content)) {
    issues.push({
      code: 'B3',
      level: 'INFO',
      message: 'No concurrency group with cancel-in-progress was detected',
    });
  }

  return issues;
}

async function collectWorkflowFiles(fs: DevForgeFS, workflowRoot: string): Promise<string[]> {
  const files = await fs.listFiles(workflowRoot).catch(() => []);
  return files
    .map((relativePath) => path.posix.join(workflowRoot, relativePath))
    .filter((filePath) => /\.ya?ml$/i.test(filePath));
}

function summarizeIssues(issues: AuditIssue[]): Record<AuditLevel, number> {
  const counts: Record<AuditLevel, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFO: 0,
  };

  for (const issue of issues) {
    counts[issue.level] += 1;
  }

  return counts;
}

function formatSummary(counts: Record<AuditLevel, number>): string {
  const parts: string[] = [];
  if (counts.CRITICAL > 0) parts.push(`${counts.CRITICAL} CRITICAL`);
  if (counts.HIGH > 0) parts.push(`${counts.HIGH} HIGH`);
  if (counts.MEDIUM > 0) parts.push(`${counts.MEDIUM} MEDIUM`);
  if (counts.LOW > 0) parts.push(`${counts.LOW} LOW`);
  if (counts.INFO > 0) parts.push(`${counts.INFO} INFO`);
  return parts.length > 0 ? parts.join(', ') : 'No issues';
}

function hasHardcodedCredential(content: string): boolean {
  return content.split(/\r?\n/).some((line) => {
    const match = line.match(/\b(token|password|key)\b\s*:\s*(.+)$/i);
    if (!match) {
      return false;
    }

    const value = match[2]?.trim() ?? '';
    return value.length > 0 && !value.includes('${{');
  });
}

function hasUnpinnedCheckout(content: string): boolean {
  return /uses\s*:\s*['"]?actions\/checkout(?!@v\d)/i.test(content);
}

function hasSecretsPassedToUntrustedAction(content: string): boolean {
  if (!/\$\{\{\s*secrets\./i.test(content)) {
    return false;
  }

  const usesMatches = content.match(/uses\s*:\s*['"]?([^'"\s]+)['"]?/gi) ?? [];
  return usesMatches.some((line) => {
    const action =
      line
        .split(':', 2)[1]
        ?.trim()
        .replace(/^['"]|['"]$/g, '') ?? '';
    return (
      action.length > 0 && !TRUSTED_ACTION_PREFIXES.some((prefix) => action.startsWith(prefix))
    );
  });
}

async function runSecurityAudit(projectRoot: string, options: AuditOptions): Promise<void> {
  const fs = new DevForgeFS(projectRoot);
  const workflowRoot = '.github/workflows';
  const workflowFiles = await collectWorkflowFiles(fs, workflowRoot);

  if (workflowFiles.length === 0) {
    console.log('No workflow YAML files found under .github/workflows/.');
    process.exitCode = 0;
    return;
  }

  const credentials = await loadAuditCredentials();
  if (!credentials) {
    logger.warn('No credentials configured. Run `devforge agent reset` to set up a provider.');
    process.exitCode = 1;
    return;
  }

  const provider = buildAuditProvider(credentials);
  const readFile = (p: string) => fs.readFile(p);
  const agent = new SecurityComplianceAgent(
    provider,
    credentials,
    createAgentCache(credentials),
    readFile,
  );

  const config = buildMinimalConfig(projectRoot);
  const context: AgentContext = {
    config,
    generatedFiles: workflowFiles,
    lastRunJson: null,
    failureSignals: [],
  };

  const runtime = new AgentRuntime();
  const result = await runtime.runForeground(agent, context);

  const violations = extractViolations(result.recommendations, workflowFiles[0] ?? projectRoot);

  const riskScore =
    violations.length === 0
      ? 0
      : violations.some((v) => v.severity === 'critical')
        ? 90
        : violations.some((v) => v.severity === 'high')
          ? 60
          : 30;

  printSecurityReport(violations, riskScore);
  await generateComplianceReport(violations, config, fs);

  if (options.fix) {
    await applyAutoFixes(violations, fs);
  }

  const hasCritical = violations.some((v) => v.severity === 'critical');
  const hasHigh = violations.some((v) => v.severity === 'high');
  process.exitCode = hasCritical ? 1 : hasHigh ? 2 : 0;
}

async function loadAuditCredentials(): Promise<StoredCredentials | null> {
  try {
    const manager = new CredentialManager();
    if (await manager.isFirstRun()) return null;
    return await manager.loadCredentials();
  } catch {
    return null;
  }
}

function buildAuditProvider(credentials: StoredCredentials): LLMProvider {
  if (credentials.provider === 'offline') {
    return { name: 'offline', chat: async () => '', isAvailable: async () => false };
  }
  return resolveProvider({ provider: credentials.provider, credentials: credentials.credentials });
}

function buildMinimalConfig(projectRoot: string): DevForgeConfig {
  return {
    projectRoot,
    detected: {
      framework: Framework.UNKNOWN,
      packageManager: PackageManager.NPM,
      nodeVersion: '20',
      hasDocker: false,
      hasTests: false,
      hasLinting: false,
      testCommand: null,
      buildCommand: null,
      installCommand: 'npm ci',
      detectedAt: new Date().toISOString(),
    },
    user: {
      deploymentTarget: DeploymentTarget.DOCKER,
      branchStrategy: BranchStrategy.FEATURE_MAIN,
      dockerRequired: false,
      multiEnvironment: false,
      environments: [],
    },
    dryRun: false,
    generatedAt: new Date().toISOString(),
    devforgeVersion: '2.0.0',
  };
}

function extractViolations(
  recommendations: import('../agent/types').Recommendation[],
  fallbackFile: string,
): import('../agent/security/StaticSecurityScanner').ComplianceViolation[] {
  return recommendations.map((r) => {
    const controlId = r.title.match(/\[([^\]]+)\]/)?.[1] ?? 'UNKNOWN';
    const standard: 'NIST' | 'ISO27001' = controlId.startsWith('ISO') ? 'ISO27001' : 'NIST';
    return {
      controlId,
      standard,
      title: r.title.replace(/^\[[^\]]+\]\s*/, ''),
      description: r.description,
      affectedFile: fallbackFile,
      severity: r.severity,
      remediation: r.description.split(' — ').pop() ?? '',
    };
  });
}

export default auditCommand;
