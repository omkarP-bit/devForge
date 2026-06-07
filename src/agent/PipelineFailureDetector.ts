import { parsePackageJson } from '../detector/packageJsonParser';
import { DevForgeFS } from '../utils/fs';
import { DevForgeConfig, Framework } from '../types';
import { FailureSignal } from './types';

const SECRETS_REGEX = /\$\{\{\s*secrets\.([A-Z_][A-Z0-9_]*)\s*\}\}/g;
const WORKFLOW_ROOT = '.github/workflows';
const SECRETS_DOC_PATH = '.devforge/SECRETS_REQUIRED.md';

export async function detectLikelyFailures(
  config: DevForgeConfig,
  fs: DevForgeFS,
): Promise<FailureSignal[]> {
  const signals: FailureSignal[] = [];

  const hasWorkflows = await fs.fileExists(WORKFLOW_ROOT);
  if (!hasWorkflows) {
    return signals;
  }

  const workflowFiles = await collectWorkflowFiles(fs);
  const workflowContents = await readWorkflowContents(fs, workflowFiles);

  signals.push(...detectMissingScript(config, workflowContents));
  signals.push(...(await detectNodeVersionMismatch(fs, workflowContents)));
  signals.push(...(await detectMissingDependency(config, fs)));
  signals.push(...(await detectInvalidSecretRefs(fs, workflowContents)));

  return signals;
}

async function collectWorkflowFiles(fs: DevForgeFS): Promise<string[]> {
  const files = await fs.listFiles(WORKFLOW_ROOT).catch(() => []);
  return files
    .filter((relativePath) => /\.ya?ml$/i.test(relativePath))
    .map((relativePath) => `${WORKFLOW_ROOT}/${relativePath.replace(/\\/g, '/')}`);
}

async function readWorkflowContents(
  fs: DevForgeFS,
  workflowFiles: string[],
): Promise<Array<{ path: string; content: string }>> {
  const contents: Array<{ path: string; content: string }> = [];

  for (const filePath of workflowFiles) {
    try {
      const content = await fs.readFile(filePath);
      contents.push({ path: filePath, content });
    } catch {
      // Skip unreadable workflow files.
    }
  }

  return contents;
}

function detectMissingScript(
  config: DevForgeConfig,
  workflowContents: Array<{ path: string; content: string }>,
): FailureSignal[] {
  if (config.detected.testCommand !== null) {
    return [];
  }

  const signals: FailureSignal[] = [];

  for (const workflow of workflowContents) {
    if (!workflowHasTestStep(workflow.content)) {
      continue;
    }

    signals.push({
      type: 'missing_script',
      severity: 'error',
      message: 'Workflow includes a test step but no test script was detected in package.json',
      affectedFile: workflow.path,
    });
  }

  return signals;
}

function workflowHasTestStep(content: string): boolean {
  if (/^\s*test:\s*$/m.test(content)) {
    return true;
  }

  return /-\s*run:\s*(npm test|yarn test|pnpm test|npx jest|jest|vitest)/i.test(content);
}

async function detectNodeVersionMismatch(
  fs: DevForgeFS,
  workflowContents: Array<{ path: string; content: string }>,
): Promise<FailureSignal[]> {
  const projectNodeVersion = await resolveProjectNodeVersion(fs);
  if (!projectNodeVersion) {
    return [];
  }

  const signals: FailureSignal[] = [];

  for (const workflow of workflowContents) {
    const workflowVersions = extractWorkflowNodeVersions(workflow.content);
    if (workflowVersions.length === 0) {
      continue;
    }

    const mismatched = workflowVersions.filter((version) => version !== projectNodeVersion);
    if (mismatched.length === 0) {
      continue;
    }

    signals.push({
      type: 'node_version_mismatch',
      severity: 'warning',
      message: `Workflow pins Node ${mismatched.join(', ')} but project requires Node ${projectNodeVersion}`,
      affectedFile: workflow.path,
    });
  }

  return signals;
}

async function resolveProjectNodeVersion(fs: DevForgeFS): Promise<string | null> {
  if (await fs.fileExists('.nvmrc')) {
    try {
      const nvmrc = (await fs.readFile('.nvmrc')).trim();
      if (nvmrc.length > 0) {
        return normalizeNodeVersion(nvmrc);
      }
    } catch {
      // Fall through to package.json engines.node.
    }
  }

  try {
    const packageJson = await parsePackageJson(fs);
    if (packageJson.engines?.node) {
      return normalizeNodeVersion(packageJson.engines.node);
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeNodeVersion(version: string): string {
  const match = version.match(/(\d+)/);
  return match ? match[1]! : version.trim();
}

function extractWorkflowNodeVersions(content: string): string[] {
  const versions = new Set<string>();

  const matrixMatch = content.match(/node-version:\s*\[([^\]]+)\]/i);
  if (matrixMatch?.[1]) {
    for (const part of matrixMatch[1].split(',')) {
      const normalized = normalizeNodeVersion(part);
      if (normalized) {
        versions.add(normalized);
      }
    }
  }

  for (const match of content.matchAll(/node-version:\s*['"]?(\d+)['"]?/gi)) {
    if (match[1]) {
      versions.add(match[1]);
    }
  }

  return Array.from(versions);
}

async function detectMissingDependency(
  config: DevForgeConfig,
  fs: DevForgeFS,
): Promise<FailureSignal[]> {
  if (config.detected.framework !== Framework.NEXTJS) {
    return [];
  }

  try {
    const packageJson = await parsePackageJson(fs);
    const hasNext =
      Object.prototype.hasOwnProperty.call(packageJson.dependencies, 'next') ||
      Object.prototype.hasOwnProperty.call(packageJson.devDependencies, 'next');

    if (hasNext) {
      return [];
    }

    return [
      {
        type: 'missing_dependency',
        severity: 'error',
        message: 'Detected Next.js framework but package.json has no "next" dependency',
        affectedFile: 'package.json',
      },
    ];
  } catch {
    return [];
  }
}

async function detectInvalidSecretRefs(
  fs: DevForgeFS,
  workflowContents: Array<{ path: string; content: string }>,
): Promise<FailureSignal[]> {
  const documentedSecrets = await loadDocumentedSecrets(fs);
  const signals: FailureSignal[] = [];

  for (const workflow of workflowContents) {
    const secretNames = extractSecretNames(workflow.content);
    for (const secretName of secretNames) {
      if (documentedSecrets.has(secretName)) {
        continue;
      }

      signals.push({
        type: 'invalid_secret_ref',
        severity: 'warning',
        message: `Workflow references undocumented secret "${secretName}"`,
        affectedFile: workflow.path,
      });
    }
  }

  return signals;
}

function extractSecretNames(content: string): string[] {
  const names = new Set<string>();

  for (const match of content.matchAll(SECRETS_REGEX)) {
    if (match[1]) {
      names.add(match[1]);
    }
  }

  return Array.from(names);
}

async function loadDocumentedSecrets(fs: DevForgeFS): Promise<Set<string>> {
  const documented = new Set<string>();

  if (!(await fs.fileExists(SECRETS_DOC_PATH))) {
    return documented;
  }

  try {
    const content = await fs.readFile(SECRETS_DOC_PATH);
    for (const match of content.matchAll(/^##\s+([A-Z_][A-Z0-9_]*)\s*$/gm)) {
      if (match[1]) {
        documented.add(match[1]);
      }
    }
  } catch {
    return documented;
  }

  return documented;
}
