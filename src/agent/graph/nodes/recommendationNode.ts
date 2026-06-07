import { RecommendationStore } from '../../RecommendationStore';
import { createAgentCache } from '../../cache/createAgentCache';
import { logger } from '../../../utils/logger';
import { DevForgeFS } from '../../../utils/fs';
import {
  createDefaultProvider,
  createDefaultRecommendationAgent,
  PostInitGraphDependencies,
} from '../dependencies';
import { DevForgeGraphUpdate, DevForgeGraphStateType } from '../stateAnnotation';

export interface RecommendationNodeContext {
  fs: DevForgeFS;
  devforgeVersion: string;
  dependencies?: PostInitGraphDependencies;
}

export function createRecommendationNode(context: RecommendationNodeContext) {
  return async function recommendationNode(
    state: DevForgeGraphStateType,
  ): Promise<DevForgeGraphUpdate> {
    try {
      logger.info('Running pipeline analysis...');

      const createProvider = context.dependencies?.createProvider ?? createDefaultProvider;
      const createAgent =
        context.dependencies?.createRecommendationAgent ?? createDefaultRecommendationAgent;

      const provider = createProvider(state.credentials);
      const cache = createAgentCache(state.credentials);
      const recommendationStore = new RecommendationStore(context.fs, context.devforgeVersion);
      const agent = createAgent({
        provider,
        credentials: state.credentials,
        cache,
        recommendationStore,
      });

      const recommendationResult = await agent.run(state.context);

      return {
        recommendationResult,
        phase: 'recommend',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Recommendation agent failed';
      return {
        phase: 'recommend',
        errors: [message],
      };
    }
  };
}
