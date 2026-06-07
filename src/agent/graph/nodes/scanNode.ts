import { isOfflineMode } from '../../OfflineFallback';
import { violationsFromRecommendations } from '../../reporters/securityReportUtils';
import { createAgentCache } from '../../cache/createAgentCache';
import {
  createDefaultProvider,
  createDefaultSecurityAgent,
  createReadFile,
  PostInitGraphDependencies,
} from '../dependencies';
import { DevForgeGraphUpdate, DevForgeGraphStateType } from '../stateAnnotation';
import { createStaticScanNode } from './staticScanNode';
import { DevForgeFS } from '../../../utils/fs';

export interface ScanNodeContext {
  fs: DevForgeFS;
  dependencies?: PostInitGraphDependencies;
}

export function createScanNode(context: ScanNodeContext) {
  const staticScan = createStaticScanNode(context);

  return async function scanNode(state: DevForgeGraphStateType): Promise<DevForgeGraphUpdate> {
    if (isOfflineMode(state.credentials)) {
      return staticScan(state);
    }

    const createProvider = context.dependencies?.createProvider ?? createDefaultProvider;
    const createAgent = context.dependencies?.createSecurityAgent ?? createDefaultSecurityAgent;
    const readFile = createReadFile(context.fs);

    const provider = createProvider(state.credentials);
    const agent = createAgent({
      provider,
      credentials: state.credentials,
      cache: createAgentCache(state.credentials),
      readFile,
    });

    const securityResult = await agent.run(state.context);
    const fallbackFile = state.context.generatedFiles[0] ?? state.context.config.projectRoot;
    const violations = violationsFromRecommendations(securityResult.recommendations, fallbackFile);

    return {
      securityResult,
      violations,
      phase: 'security',
    };
  };
}
