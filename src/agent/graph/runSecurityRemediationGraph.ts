import { StoredCredentials } from '../credentials/types';
import { AgentContext } from '../types';
import { PostInitGraphDependencies } from './dependencies';
import { buildSecurityRemediationGraph } from './securityRemediationGraph';
import { createInitialGraphState, DevForgeGraphState } from './types';

export interface RunSecurityRemediationGraphInput {
  context: AgentContext;
  credentials: StoredCredentials;
  autoApprove?: boolean;
  maxFixAttempts?: number;
}

export interface RunSecurityRemediationGraphOptions {
  fs: import('../../utils/fs').DevForgeFS;
  dependencies?: PostInitGraphDependencies;
}

export async function runSecurityRemediationGraph(
  input: RunSecurityRemediationGraphInput,
  options: RunSecurityRemediationGraphOptions,
): Promise<DevForgeGraphState> {
  const initialState = createInitialGraphState({
    context: input.context,
    credentials: input.credentials,
    autoApprove: input.autoApprove ?? false,
    maxFixAttempts: input.maxFixAttempts,
  });

  const graph = buildSecurityRemediationGraph({
    fs: options.fs,
    dependencies: options.dependencies,
  });

  return graph.invoke(initialState);
}
