import { CredentialManager } from '../agent/credentials';
import { isGraphEnabled } from '../agent/graph/GraphConfig';
import { detectLikelyFailures } from '../agent/PipelineFailureDetector';
import {
  DevForgeConfig,
  Framework,
  PackageManager,
  DeploymentTarget,
  BranchStrategy,
} from '../types';
import { DevForgeFS } from '../utils/fs';
import { logger } from '../utils/logger';
import { LastRunMetadata } from '../generator';

export interface DiagnoseCommandOptions {
  noAgent?: boolean;
  json?: boolean;
}

export async function diagnoseCommand(
  projectRoot: string,
  options: DiagnoseCommandOptions = {},
): Promise<void> {
  const fs = new DevForgeFS(projectRoot);
  const config = buildDiagnoseConfig(projectRoot);

  if (options.noAgent || !isGraphEnabled({ noAgent: options.noAgent })) {
    const failureSignals = await detectLikelyFailures(config, fs);
    const lastRunJson = await readLastRunMetadata(fs);

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            mode: 'deterministic',
            failureSignals,
            lastRun: lastRunJson,
          },
          null,
          2,
        ),
      );
      return;
    }

    logger.info(`Detected ${failureSignals.length} likely failure signal(s).`);
    for (const signal of failureSignals) {
      logger.warn(`${signal.severity}: ${signal.message} (${signal.affectedFile})`);
    }
    return;
  }

  const credentials = await loadCredentials();
  if (!credentials) {
    logger.warn('No credentials configured. Run `devforge agent reset` or use --no-agent.');
    process.exitCode = 1;
    return;
  }

  const failureSignals = await detectLikelyFailures(config, fs);
  const lastRunJson = await readLastRunMetadata(fs);
  const generatedFiles = await collectWorkflowFiles(fs);

  const { runPipelineDiagnosisGraph } = await import('../agent/graph/runPipelineDiagnosisGraph');
  const state = await runPipelineDiagnosisGraph(
    {
      context: {
        config,
        generatedFiles,
        lastRunJson,
        failureSignals,
      },
      credentials,
      skipReport: options.json ?? false,
      noAgent: options.noAgent ?? false,
    },
    {
      fs,
      devforgeVersion: config.devforgeVersion,
    },
  );

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          phase: state.phase,
          failureSignals: state.context.failureSignals,
          recommendations: state.recommendationResult?.recommendations ?? [],
          storedRecommendationIds: state.storedRecommendationIds,
          expectedOutputs: state.recommendationResult?.expectedOutputs ?? [],
          errors: state.errors,
        },
        null,
        2,
      ),
    );
    return;
  }

  const recommendationCount = state.recommendationResult?.recommendations.length ?? 0;
  logger.success(`Diagnosis complete: ${recommendationCount} recommendation(s).`);
}

async function loadCredentials() {
  try {
    const manager = new CredentialManager();
    if (await manager.isFirstRun()) {
      return null;
    }
    return await manager.loadCredentials();
  } catch {
    return null;
  }
}

async function readLastRunMetadata(fs: DevForgeFS): Promise<LastRunMetadata | null> {
  try {
    const raw = await fs.readFile('.devforge/last-run.json');
    return JSON.parse(raw) as LastRunMetadata;
  } catch {
    return null;
  }
}

async function collectWorkflowFiles(fs: DevForgeFS): Promise<string[]> {
  const workflowRoot = '.github/workflows';
  if (!(await fs.fileExists(workflowRoot))) {
    return [];
  }

  const files = await fs.listFiles(workflowRoot).catch(() => []);
  return files
    .filter((relativePath) => /\.ya?ml$/i.test(relativePath))
    .map((relativePath) => `${workflowRoot}/${relativePath.replace(/\\/g, '/')}`);
}

function buildDiagnoseConfig(projectRoot: string): DevForgeConfig {
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
      enableTrivyScan: false,
    },
    dryRun: false,
    generatedAt: new Date().toISOString(),
    devforgeVersion: '2.1.0',
  };
}
