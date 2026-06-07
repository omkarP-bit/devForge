import { AgentRuntime } from '../agent/AgentRuntime';
import { RecommendationAgent } from '../agent/agents';
import { createAgentCache } from '../agent/cache/createAgentCache';
import { CredentialManager } from '../agent/credentials';
import { StoredCredentials } from '../agent/credentials/types';
import { isGraphEnabled } from '../agent/graph/GraphConfig';
import { detectLikelyFailures } from '../agent/PipelineFailureDetector';
import { resolveProvider } from '../agent/providers/ProviderFactory';
import { LLMProvider } from '../agent/providers/types';
import { RecommendationStore } from '../agent/RecommendationStore';
import { ExpectedOutputReporter } from '../agent/reporters';
import { AgentContext, AgentResult } from '../agent/types';
import { LastRunMetadata } from '../generator';
import { DevForgeConfig } from '../types';
import { DevForgeFS } from '../utils/fs';
import { logger } from '../utils/logger';

export interface RecommendationPipelineOptions {
  noAgent?: boolean;
  noReport?: boolean;
  verbose?: boolean;
}

export async function runRecommendationPipeline(
  config: DevForgeConfig,
  fs: DevForgeFS,
  generatedFiles: string[],
  options: RecommendationPipelineOptions = {},
): Promise<void> {
  if (!options.noAgent) {
    const activeCredentials = await loadActiveCredentials();
    if (activeCredentials) {
      if (isGraphEnabled({ noAgent: options.noAgent })) {
        const failureSignals = await detectLikelyFailures(config, fs);
        const lastRunJson = await readLastRunMetadata(fs);
        const { runDevForgeGraph } = await import('../agent/graph/runDevForgeGraph');
        await runDevForgeGraph({
          config,
          fs,
          generatedFiles,
          credentials: activeCredentials,
          failureSignals,
          lastRunJson,
          noAgent: options.noAgent ?? false,
          skipReport: options.noReport ?? false,
          verbose: options.verbose ?? false,
        });
        return;
      }

      const agentResult = await runLegacyRecommendationAgent(
        config,
        fs,
        generatedFiles,
        activeCredentials,
      );

      if (!options.noReport) {
        const reporter = new ExpectedOutputReporter();
        await reporter.report(agentResult, config);
      }
    }
  } else if (!options.noReport) {
    const reporter = new ExpectedOutputReporter();
    await reporter.report(createEmptyAgentResult(), config);
  }
}

async function runLegacyRecommendationAgent(
  config: DevForgeConfig,
  fs: DevForgeFS,
  generatedFiles: string[],
  activeCredentials: StoredCredentials,
): Promise<AgentResult> {
  logger.info('Running pipeline analysis...');
  const failureSignals = await detectLikelyFailures(config, fs);
  const lastRunJson = await readLastRunMetadata(fs);
  const agentContext: AgentContext = {
    config,
    generatedFiles,
    lastRunJson,
    failureSignals,
  };

  const provider = createAgentProvider(activeCredentials);
  const recommendationStore = new RecommendationStore(fs, config.devforgeVersion);
  const agent = new RecommendationAgent(
    provider,
    activeCredentials,
    createAgentCache(activeCredentials),
    recommendationStore,
  );
  const runtime = new AgentRuntime();
  return runtime.runForeground(agent, agentContext);
}

async function loadActiveCredentials(): Promise<StoredCredentials | null> {
  const credentialManager = new CredentialManager();

  try {
    if (await credentialManager.isFirstRun()) {
      return null;
    }

    return await credentialManager.loadCredentials();
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

function createAgentProvider(credentials: StoredCredentials): LLMProvider {
  if (credentials.provider === 'offline') {
    return {
      name: 'offline',
      chat: async () => '',
      isAvailable: async () => false,
    };
  }

  return resolveProvider({
    provider: credentials.provider,
    credentials: credentials.credentials,
  });
}

function createEmptyAgentResult(): AgentResult {
  return {
    agentName: 'RecommendationAgent',
    success: true,
    messages: [],
    expectedOutputs: [],
    recommendations: [],
    warnings: [],
  };
}
