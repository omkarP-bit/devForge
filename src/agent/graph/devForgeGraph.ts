import { END, START, StateGraph } from '@langchain/langgraph';
import { DevForgeFS } from '../../utils/fs';
import { PostInitGraphDependencies } from './dependencies';
import { checkEnabledNode, routeAfterCheckEnabled } from './nodes/checkEnabledNode';
import {
  createDetectFailuresNode,
  shouldEnrichRecommendations,
} from './nodes/detectFailuresNode';
import { createEnrichRecommendationsNode } from './nodes/enrichRecommendationsNode';
import { createLoadLastRunNode } from './nodes/loadLastRunNode';
import { createPersistMemoryNode } from './nodes/persistMemoryNode';
import { reportExpectedOutputsNode } from './nodes/reportExpectedOutputsNode';
import { createSecurityNode } from './nodes/securityNode';
import { DevForgeGraphStateAnnotation, DevForgeGraphStateType } from './stateAnnotation';

export interface DevForgeGraphBuildOptions {
  fs: DevForgeFS;
  devforgeVersion: string;
  dependencies?: PostInitGraphDependencies;
}

export function routeAfterDetectForDevForge(
  state: DevForgeGraphStateType,
): 'enrich_recommendations' | 'security' {
  return shouldEnrichRecommendations(state) ? 'enrich_recommendations' : 'security';
}

export function routeAfterSecurity(
  state: DevForgeGraphStateType,
): 'report_expected' | 'persist_memory' {
  return state.skipReport ? 'persist_memory' : 'report_expected';
}

export function buildDevForgeGraph(options: DevForgeGraphBuildOptions) {
  const loadLastRunNode = createLoadLastRunNode({ fs: options.fs });
  const detectFailuresNode = createDetectFailuresNode({ fs: options.fs });
  const enrichRecommendationsNode = createEnrichRecommendationsNode({
    fs: options.fs,
    devforgeVersion: options.devforgeVersion,
    dependencies: options.dependencies,
  });
  const securityNode = createSecurityNode({
    fs: options.fs,
    dependencies: options.dependencies,
  });
  const persistMemoryNode = createPersistMemoryNode({ fs: options.fs });

  const graph = new StateGraph(DevForgeGraphStateAnnotation)
    .addNode('check_enabled', checkEnabledNode)
    .addNode('load_last_run', loadLastRunNode)
    .addNode('detect_failures', detectFailuresNode)
    .addNode('enrich_recommendations', enrichRecommendationsNode)
    .addNode('security', securityNode)
    .addNode('report_expected', reportExpectedOutputsNode)
    .addNode('persist_memory', persistMemoryNode)
    .addEdge(START, 'check_enabled')
    .addConditionalEdges('check_enabled', routeAfterCheckEnabled, {
      recommend: 'load_last_run',
      __end__: END,
    })
    .addEdge('load_last_run', 'detect_failures')
    .addConditionalEdges('detect_failures', routeAfterDetectForDevForge, {
      enrich_recommendations: 'enrich_recommendations',
      security: 'security',
    })
    .addEdge('enrich_recommendations', 'security')
    .addConditionalEdges('security', routeAfterSecurity, {
      report_expected: 'report_expected',
      persist_memory: 'persist_memory',
    })
    .addEdge('report_expected', 'persist_memory')
    .addEdge('persist_memory', END);

  return graph.compile();
}
