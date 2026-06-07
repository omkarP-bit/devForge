import { END, START, StateGraph } from '@langchain/langgraph';
import { DevForgeFS } from '../../utils/fs';
import { PostInitGraphDependencies } from './dependencies';
import { checkEnabledNode, routeAfterCheckEnabled } from './nodes/checkEnabledNode';
import { createRecommendationNode } from './nodes/recommendationNode';
import { createSecurityNode } from './nodes/securityNode';
import { iacGenerateNode, routeAfterIaCGenerate } from './nodes/iacGenerateNode';
import { iacVerifyNode, routeAfterIaCVerify } from './nodes/iacVerifyNode';
import { createIaCWriteNode } from './nodes/iacWriteNode';
import { DevForgeGraphStateAnnotation } from './stateAnnotation';
import { supportsIaCGeneration } from '../../templates/iac-blocks/registry';

export interface PostInitGraphBuildOptions {
  fs: DevForgeFS;
  devforgeVersion: string;
  dependencies?: PostInitGraphDependencies;
  enableIaCGeneration?: boolean;
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
  const iacWriteNode = createIaCWriteNode(options.fs);

  const graph = new StateGraph(DevForgeGraphStateAnnotation)
    .addNode('check_enabled', checkEnabledNode)
    .addNode('recommend', recommendationNode)
    .addNode('security', securityNode)
    .addNode('iac_generate', iacGenerateNode)
    .addNode('iac_verify', iacVerifyNode)
    .addNode('iac_write', iacWriteNode)
    .addEdge(START, 'check_enabled')
    .addConditionalEdges('check_enabled', routeAfterCheckEnabled, {
      recommend: 'recommend',
      __end__: END,
    })
    .addEdge('recommend', 'security')
    .addConditionalEdges('security', routeAfterSecurity, {
      iac_generate: 'iac_generate',
      __end__: END,
    })
    .addConditionalEdges('iac_generate', routeAfterIaCGenerate, {
      iac_verify: 'iac_verify',
      __end__: END,
    })
    .addConditionalEdges('iac_verify', routeAfterIaCVerify, {
      iac_write: 'iac_write',
      iac_generate: 'iac_generate',
      __end__: END,
    })
    .addEdge('iac_write', END);

  return graph.compile();
}

function routeAfterSecurity(
  state: typeof DevForgeGraphStateAnnotation.State,
): 'iac_generate' | '__end__' {
  const target = state.context.config.user.deploymentTarget;
  const iacTool = state.context.config.user.iacTool;

  if (
    iacTool &&
    iacTool !== 'skip' &&
    supportsIaCGeneration(target) &&
    !state.iacSkipped
  ) {
    return 'iac_generate';
  }

  return '__end__';
}
