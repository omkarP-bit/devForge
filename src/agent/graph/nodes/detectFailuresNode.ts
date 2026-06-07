import { detectLikelyFailures } from '../../PipelineFailureDetector';
import { DevForgeGraphUpdate, DevForgeGraphStateType } from '../stateAnnotation';
import { DevForgeFS } from '../../../utils/fs';

export interface DetectFailuresNodeContext {
  fs: DevForgeFS;
}

export function shouldEnrichRecommendations(state: DevForgeGraphStateType): boolean {
  if (state.context.failureSignals.length > 0) {
    return true;
  }

  const lastRun = state.context.lastRunJson;
  if (!lastRun) {
    return false;
  }

  return lastRun.generationResult.errors.length > 0;
}

export function createDetectFailuresNode(context: DetectFailuresNodeContext) {
  return async function detectFailuresNode(
    state: DevForgeGraphStateType,
  ): Promise<DevForgeGraphUpdate> {
    const detected = await detectLikelyFailures(state.context.config, context.fs);
    const failureSignals =
      detected.length > 0 ? detected : state.context.failureSignals;

    return {
      context: {
        ...state.context,
        failureSignals,
      },
      phase: 'diagnose',
    };
  };
}

export function routeAfterDetectFailures(
  state: DevForgeGraphStateType,
): 'enrich_recommendations' | 'report_expected' {
  return shouldEnrichRecommendations(state) ? 'enrich_recommendations' : 'report_expected';
}
