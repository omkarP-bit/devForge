import { END, START, StateGraph } from '@langchain/langgraph';
import { DevForgeFS } from '../../utils/fs';
import { PostInitGraphDependencies } from './dependencies';
import {
  createDetectFailuresNode,
  routeAfterDetectFailures,
} from './nodes/detectFailuresNode';
import { createEnrichRecommendationsNode } from './nodes/enrichRecommendationsNode';
import { createLoadLastRunNode } from './nodes/loadLastRunNode';
import { reportExpectedOutputsNode } from './nodes/reportExpectedOutputsNode';
import { DevForgeGraphStateAnnotation } from './stateAnnotation';

export interface PipelineDiagnosisGraphOptions {
  fs: DevForgeFS;
  devforgeVersion: string;
  dependencies?: PostInitGraphDependencies;
}

export function buildPipelineDiagnosisGraph(options: PipelineDiagnosisGraphOptions) {
  const loadLastRunNode = createLoadLastRunNode({ fs: options.fs });
  const detectFailuresNode = createDetectFailuresNode({ fs: options.fs });
  const enrichRecommendationsNode = createEnrichRecommendationsNode({
    fs: options.fs,
    devforgeVersion: options.devforgeVersion,
    dependencies: options.dependencies,
  });

  const graph = new StateGraph(DevForgeGraphStateAnnotation)
    .addNode('load_last_run', loadLastRunNode)
    .addNode('detect_failures', detectFailuresNode)
    .addNode('enrich_recommendations', enrichRecommendationsNode)
    .addNode('report_expected', reportExpectedOutputsNode)
    .addEdge(START, 'load_last_run')
    .addEdge('load_last_run', 'detect_failures')
    .addConditionalEdges('detect_failures', routeAfterDetectFailures, {
      enrich_recommendations: 'enrich_recommendations',
      report_expected: 'report_expected',
    })
    .addEdge('enrich_recommendations', 'report_expected')
    .addEdge('report_expected', END);

  return graph.compile();
}
