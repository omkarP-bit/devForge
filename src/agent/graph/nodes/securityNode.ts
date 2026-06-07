import {
  reportSecurityAgentResult,
  violationsFromRecommendations,
} from '../../reporters/securityReportUtils';
import { createAgentCache } from '../../cache/createAgentCache';
import { logger } from '../../../utils/logger';
import {
  createDefaultProvider,
  createDefaultSecurityAgent,
  createReadFile,
  PostInitGraphDependencies,
} from '../dependencies';
import { DevForgeGraphUpdate, DevForgeGraphStateType } from '../stateAnnotation';
import { DevForgeFS } from '../../../utils/fs';

export interface SecurityNodeContext {
  fs: DevForgeFS;
  dependencies?: PostInitGraphDependencies;
}

export function createSecurityNode(context: SecurityNodeContext) {
  return async function securityNode(state: DevForgeGraphStateType): Promise<DevForgeGraphUpdate> {
    try {
      const createProvider = context.dependencies?.createProvider ?? createDefaultProvider;
      const createAgent = context.dependencies?.createSecurityAgent ?? createDefaultSecurityAgent;
      const readFile = createReadFile(context.fs);

      const provider = createProvider(state.credentials);
      const cache = createAgentCache(state.credentials);
      const agent = createAgent({
        provider,
        credentials: state.credentials,
        cache,
        readFile,
      });

      const securityResult = await agent.run(state.context);
      const fallbackFile = state.context.generatedFiles[0] ?? state.context.config.projectRoot;
      const violations = violationsFromRecommendations(
        securityResult.recommendations,
        fallbackFile,
      );
      reportSecurityAgentResult(securityResult, fallbackFile);

      return {
        securityResult,
        violations,
        phase: 'security',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Security agent failed';
      logger.warn(`Security scan failed: ${message}`);
      return {
        phase: 'security',
        errors: [message],
      };
    }
  };
}
