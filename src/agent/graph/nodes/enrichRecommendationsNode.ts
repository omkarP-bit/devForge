import { RecommendationStore } from '../../RecommendationStore';
import { createAgentCache } from '../../cache/createAgentCache';
import { logger } from '../../../utils/logger';
import {
  createDefaultProvider,
  createDefaultRecommendationAgent,
  PostInitGraphDependencies,
} from '../dependencies';
import { DevForgeGraphUpdate, DevForgeGraphStateType } from '../stateAnnotation';
import { DevForgeFS } from '../../../utils/fs';

export interface EnrichRecommendationsNodeContext {
  fs: DevForgeFS;
  devforgeVersion: string;
  dependencies?: PostInitGraphDependencies;
}

export function createEnrichRecommendationsNode(context: EnrichRecommendationsNodeContext) {
  return async function enrichRecommendationsNode(
    state: DevForgeGraphStateType,
  ): Promise<DevForgeGraphUpdate> {
    logger.info('Running pipeline analysis...');

    const createProvider = context.dependencies?.createProvider ?? createDefaultProvider;
    const createAgent =
      context.dependencies?.createRecommendationAgent ?? createDefaultRecommendationAgent;

    const recommendationStore = new RecommendationStore(context.fs, context.devforgeVersion);
    const existing = await recommendationStore.load();
    const dismissedTitles = new Set(
      existing
        .filter((recommendation) => recommendation.status === 'dismissed')
        .map((recommendation) => `${recommendation.type}::${recommendation.title}`),
    );

    const provider = createProvider(state.credentials);
    const agent = createAgent({
      provider,
      credentials: state.credentials,
      cache: createAgentCache(state.credentials),
      recommendationStore,
    });

    const recommendationResult = await agent.run(state.context);
    const filteredRecommendations = recommendationResult.recommendations.filter(
      (recommendation) => !dismissedTitles.has(`${recommendation.type}::${recommendation.title}`),
    );

    const filteredResult = {
      ...recommendationResult,
      recommendations: filteredRecommendations,
    };

    const stored = await recommendationStore.load();
    const storedRecommendationIds = stored
      .filter((recommendation) => recommendation.status === 'new')
      .map((recommendation) => recommendation.id);

    return {
      recommendationResult: filteredResult,
      storedRecommendationIds,
      phase: 'recommend',
    };
  };
}
