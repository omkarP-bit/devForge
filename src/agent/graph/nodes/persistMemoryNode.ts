import { GraphMemory } from '../GraphMemory';
import { DevForgeGraphUpdate, DevForgeGraphStateType } from '../stateAnnotation';
import { DevForgeFS } from '../../../utils/fs';

export interface PersistMemoryNodeContext {
  fs: DevForgeFS;
}

export function createPersistMemoryNode(context: PersistMemoryNodeContext) {
  return async function persistMemoryNode(
    state: DevForgeGraphStateType,
  ): Promise<DevForgeGraphUpdate> {
    const memory = new GraphMemory(context.fs, state.context.config.projectRoot);
    const record = await memory.saveRun({
      phase: 'complete',
      startedAt: state.metadata.startedAt,
      completedAt: new Date().toISOString(),
      nodeTimings: state.nodeTimings,
      recommendationCount: state.recommendationResult?.recommendations.length ?? 0,
      securityWarningCount: state.securityResult?.warnings.length ?? 0,
      violationCount: state.violations.length,
      storedRecommendationIds: state.storedRecommendationIds,
      errors: state.errors,
    });

    return {
      metadata: {
        ...state.metadata,
        completedAt: record.completedAt,
        projectNamespace: record.projectNamespace,
      },
      phase: 'complete',
    };
  };
}
