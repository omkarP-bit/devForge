import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { detectLikelyFailures } from '../../src/agent/PipelineFailureDetector';
import { DevForgeFS } from '../../src/utils/fs';
import {
  BranchStrategy,
  DeploymentTarget,
  DevForgeConfig,
  Framework,
  PackageManager,
} from '../../src/types';

function createConfig(overrides?: Partial<DevForgeConfig>): DevForgeConfig {
  return {
    projectRoot: '/tmp/project',
    detected: {
      framework: Framework.NEXTJS,
      packageManager: PackageManager.NPM,
      nodeVersion: '20',
      hasDocker: false,
      hasTests: true,
      hasLinting: true,
      testCommand: 'npm test',
      buildCommand: 'npm run build',
      installCommand: 'npm ci',
      detectedAt: new Date().toISOString(),
    },
    user: {
      deploymentTarget: DeploymentTarget.VERCEL,
      branchStrategy: BranchStrategy.FEATURE_MAIN,
      dockerRequired: false,
      multiEnvironment: false,
      environments: [],
    },
    dryRun: false,
    generatedAt: new Date().toISOString(),
    devforgeVersion: '2.0.0',
    ...overrides,
  };
}

describe('detectLikelyFailures', () => {
  let tempDir: string;
  let devFS: DevForgeFS;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-failure-detector-'));
    devFS = new DevForgeFS(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeWorkflow(name: string, content: string): Promise<void> {
    const workflowDir = path.join(tempDir, '.github', 'workflows');
    await fs.mkdir(workflowDir, { recursive: true });
    await fs.writeFile(path.join(workflowDir, name), content, 'utf-8');
  }

  it('returns no signals when .github/workflows does not exist', async () => {
    const signals = await detectLikelyFailures(createConfig(), devFS);
    expect(signals).toEqual([]);
  });

  describe('missing_script', () => {
    it('emits an error when testCommand is null and workflow has a test job', async () => {
      await writeWorkflow(
        'base-ci.yml',
        `jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test`,
      );

      const signals = await detectLikelyFailures(
        createConfig({
          detected: {
            ...createConfig().detected,
            testCommand: null,
          },
        }),
        devFS,
      );

      expect(signals).toEqual([
        expect.objectContaining({
          type: 'missing_script',
          severity: 'error',
          affectedFile: '.github/workflows/base-ci.yml',
        }),
      ]);
    });

    it('does not emit when testCommand is present', async () => {
      await writeWorkflow(
        'base-ci.yml',
        `jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test`,
      );

      const signals = await detectLikelyFailures(createConfig(), devFS);
      expect(signals.filter((signal) => signal.type === 'missing_script')).toEqual([]);
    });
  });

  describe('node_version_mismatch', () => {
    it('emits a warning when workflow node version differs from .nvmrc', async () => {
      await fs.writeFile(path.join(tempDir, '.nvmrc'), '18', 'utf-8');
      await writeWorkflow(
        'deploy.yml',
        `jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: 20`,
      );

      const signals = await detectLikelyFailures(createConfig(), devFS);

      expect(signals).toEqual([
        expect.objectContaining({
          type: 'node_version_mismatch',
          severity: 'warning',
          message: expect.stringContaining('Node 20'),
          affectedFile: '.github/workflows/deploy.yml',
        }),
      ]);
    });

    it('emits a warning when workflow matrix node version differs from engines.node', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ engines: { node: '>=18.0.0' }, dependencies: { next: '^14.0.0' } }),
        'utf-8',
      );
      await writeWorkflow(
        'ci.yml',
        `jobs:
  test:
    strategy:
      matrix:
        node-version: [20]
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}`,
      );

      const signals = await detectLikelyFailures(createConfig(), devFS);

      expect(signals).toEqual([
        expect.objectContaining({
          type: 'node_version_mismatch',
          severity: 'warning',
          message: expect.stringContaining('Node 20'),
        }),
      ]);
    });
  });

  describe('missing_dependency', () => {
    it('emits an error when Next.js is detected but next is not in package.json', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: { react: '^18.0.0' } }),
        'utf-8',
      );
      await writeWorkflow('ci.yml', 'jobs:\n  build:\n    runs-on: ubuntu-latest');

      const signals = await detectLikelyFailures(createConfig(), devFS);

      expect(signals).toEqual([
        expect.objectContaining({
          type: 'missing_dependency',
          severity: 'error',
          affectedFile: 'package.json',
        }),
      ]);
    });

    it('does not emit when next is listed in devDependencies', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ devDependencies: { next: '^14.0.0' } }),
        'utf-8',
      );
      await writeWorkflow('ci.yml', 'jobs:\n  build:\n    runs-on: ubuntu-latest');

      const signals = await detectLikelyFailures(createConfig(), devFS);
      expect(signals.filter((signal) => signal.type === 'missing_dependency')).toEqual([]);
    });
  });

  describe('invalid_secret_ref', () => {
    it('emits a warning for workflow secrets not documented in SECRETS_REQUIRED.md', async () => {
      await writeWorkflow(
        'deploy.yml',
        `jobs:
  deploy:
    steps:
      - env:
          TOKEN: "\${{ secrets.UNKNOWN_TOKEN }}"`,
      );

      const secretsDir = path.join(tempDir, '.devforge');
      await fs.mkdir(secretsDir, { recursive: true });
      await fs.writeFile(
        path.join(secretsDir, 'SECRETS_REQUIRED.md'),
        `# SECRETS_REQUIRED.md

## VERCEL_TOKEN
`,
        'utf-8',
      );

      const signals = await detectLikelyFailures(createConfig(), devFS);

      expect(signals).toEqual([
        expect.objectContaining({
          type: 'invalid_secret_ref',
          severity: 'warning',
          message: expect.stringContaining('UNKNOWN_TOKEN'),
          affectedFile: '.github/workflows/deploy.yml',
        }),
      ]);
    });

    it('does not emit for secrets documented in SECRETS_REQUIRED.md', async () => {
      await writeWorkflow(
        'deploy.yml',
        `jobs:
  deploy:
    steps:
      - env:
          TOKEN: "\${{ secrets.VERCEL_TOKEN }}"`,
      );

      const secretsDir = path.join(tempDir, '.devforge');
      await fs.mkdir(secretsDir, { recursive: true });
      await fs.writeFile(
        path.join(secretsDir, 'SECRETS_REQUIRED.md'),
        `# SECRETS_REQUIRED.md

## VERCEL_TOKEN
`,
        'utf-8',
      );

      const signals = await detectLikelyFailures(createConfig(), devFS);
      expect(signals.filter((signal) => signal.type === 'invalid_secret_ref')).toEqual([]);
    });
  });
});
