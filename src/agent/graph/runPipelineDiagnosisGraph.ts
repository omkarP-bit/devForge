import { StoredCredentials } from '../credentials/types';
import { AgentContext } from '../types';
import { DevForgeFS } from '../../utils/fs';
import { PostInitGraphDependencies } from './dependencies';
import { buildPipelineDiagnosisGraph } from './pipelineDiagnosisGraph';
import { createInitialGraphState, DevForgeGraphState } from './types';

export interface RunPipelineDiagnosisGraphInput {
  context: AgentContext;
  credentials: StoredCredentials;
  skipReport?: boolean;
  verbose?: boolean;
  noAgent?: boolean;
}

export interface RunPipelineDiagnosisGraphOptions {
  fs: DevForgeFS;
  devforgeVersion: string;
  dependencies?: PostInitGraphDependencies;
}

export async function runPipelineDiagnosisGraph(
  input: RunPipelineDiagnosisGraphInput,
  options: RunPipelineDiagnosisGraphOptions,
): Promise<DevForgeGraphState> {
  const initialState = createInitialGraphState({
    context: input.context,
    credentials: input.credentials,
    skipReport: input.skipReport ?? false,
    verbose: input.verbose ?? false,
    noAgent: input.noAgent ?? false,
  });

  const graph = buildPipelineDiagnosisGraph({
    fs: options.fs,
    devforgeVersion: options.devforgeVersion,
    dependencies: options.dependencies,
  });

  return graph.invoke(initialState);
}
