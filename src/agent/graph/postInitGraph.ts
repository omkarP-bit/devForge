import { END, START, StateGraph } from '@langchain/langgraph';
import { DevForgeFS } from '../../utils/fs';
import { PostInitGraphDependencies } from './dependencies';
import { checkEnabledNode, routeAfterCheckEnabled } from './nodes/checkEnabledNode';
import { createRecommendationNode } from './nodes/recommendationNode';
import { createSecurityNode } from './nodes/securityNode';
import { DevForgeGraphStateAnnotation } from './stateAnnotation';

export interface PostInitGraphBuildOptions {
  fs: DevForgeFS;
  devforgeVersion: string;
  dependencies?: PostInitGraphDependencies;
}

export function buildPostInitGraph(options: PostInitGraphBuildOptions) {
  const recommendationNode = createRecommendationNode({
    fs: options.fs,
    devforgeVersion: options.devforgeVersion,
    dependencies: options.dependencies,
  });
  const securityNode = createSecurityNode({
    fs: options.fs,
    dependencies: options.dependencies,
  });

  const graph = new StateGraph(DevForgeGraphStateAnnotation)
    .addNode('check_enabled', checkEnabledNode)
    .addNode('recommend', recommendationNode)
    .addNode('security', securityNode)
    .addEdge(START, 'check_enabled')
    .addConditionalEdges('check_enabled', routeAfterCheckEnabled, {
      recommend: 'recommend',
      __end__: END,
    })
    .addEdge('recommend', 'security')
    .addEdge('security', END);

  return graph.compile();
}
