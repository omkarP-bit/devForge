import { StoredCredentials } from '../credentials/types';
import { FailureSignal } from '../types';
import { LastRunMetadata } from '../../generator';
import { DevForgeConfig } from '../../types';
import { DevForgeFS } from '../../utils/fs';
import { createGraphCheckpointer } from './checkpointing';
import { PostInitGraphDependencies } from './dependencies';
import { buildDevForgeGraph } from './devForgeGraph';
import { GraphMemory } from './GraphMemory';
import { createInitialGraphState, DevForgeGraphState } from './types';

export interface RunDevForgeGraphInput {
  config: DevForgeConfig;
  fs: DevForgeFS;
  generatedFiles: string[];
  credentials: StoredCredentials;
  failureSignals?: FailureSignal[];
  lastRunJson?: LastRunMetadata | null;
  noAgent?: boolean;
  skipReport?: boolean;
  verbose?: boolean;
}

export interface RunDevForgeGraphOptions {
  dependencies?: PostInitGraphDependencies;
}

export async function runDevForgeGraph(
  input: RunDevForgeGraphInput,
  options: RunDevForgeGraphOptions = {},
): Promise<DevForgeGraphState> {
  const memory = new GraphMemory(input.fs, input.config.projectRoot);
  const namespace = memory.getProjectNamespace();
  const checkpointer = createGraphCheckpointer(input.credentials);

  const initialState = createInitialGraphState({
    context: {
      config: input.config,
      generatedFiles: input.generatedFiles,
      lastRunJson: input.lastRunJson ?? null,
      failureSignals: input.failureSignals ?? [],
    },
    credentials: input.credentials,
    noAgent: input.noAgent ?? false,
    skipReport: input.skipReport ?? false,
    verbose: input.verbose ?? false,
  });

  initialState.metadata.projectNamespace = namespace;

  const graph = buildDevForgeGraph({
    fs: input.fs,
    devforgeVersion: input.config.devforgeVersion,
    dependencies: options.dependencies,
  });

  const finalState = await graph.invoke(initialState);
  await checkpointer.save(namespace, finalState);
  await checkpointer.disconnect();

  return finalState;
}
