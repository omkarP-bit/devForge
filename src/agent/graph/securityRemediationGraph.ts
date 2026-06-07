import { END, START, StateGraph } from '@langchain/langgraph';
import { DevForgeFS } from '../../utils/fs';
import { PostInitGraphDependencies } from './dependencies';
import { hasFixableViolations } from './securityRemediationUtils';
import { createAutoFixNode } from './nodes/autoFixNode';
import { approvalNode } from './nodes/approvalNode';
import { createScanNode } from './nodes/scanNode';
import { trivyNode } from './nodes/trivyNode';
import { DevForgeGraphStateAnnotation, DevForgeGraphStateType } from './stateAnnotation';

export interface SecurityRemediationGraphOptions {
  fs: DevForgeFS;
  dependencies?: PostInitGraphDependencies;
}

export function routeAfterScan(state: DevForgeGraphStateType): 'approval' | '__end__' {
  if (!hasFixableViolations(state.violations)) {
    return '__end__';
  }

  if (state.fixAttempts >= state.maxFixAttempts) {
    return '__end__';
  }

  return 'approval';
}

export function routeAfterApproval(state: DevForgeGraphStateType): 'auto_fix' | '__end__' {
  if (!state.approved) {
    return '__end__';
  }

  return 'auto_fix';
}

export function buildSecurityRemediationGraph(options: SecurityRemediationGraphOptions) {
  const scanNode = createScanNode({
    fs: options.fs,
    dependencies: options.dependencies,
  });
  const autoFixNode = createAutoFixNode({ fs: options.fs });

  const graph = new StateGraph(DevForgeGraphStateAnnotation)
    .addNode('trivy_scan', trivyNode)
    .addNode('scan', scanNode)
    .addNode('approval', approvalNode)
    .addNode('auto_fix', autoFixNode)
    .addEdge(START, 'trivy_scan')
    .addEdge('trivy_scan', 'scan')
    .addConditionalEdges('scan', routeAfterScan, {
      approval: 'approval',
      __end__: END,
    })
    .addConditionalEdges('approval', routeAfterApproval, {
      auto_fix: 'auto_fix',
      __end__: END,
    })
    .addEdge('auto_fix', 'scan');

  return graph.compile();
}
