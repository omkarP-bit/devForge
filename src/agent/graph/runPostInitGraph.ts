import { FailureSignal } from '../types';
import { StoredCredentials } from '../credentials/types';
import { LastRunMetadata } from '../../generator';
import { DevForgeConfig } from '../../types';
import { DevForgeFS } from '../../utils/fs';
import { PostInitGraphDependencies } from './dependencies';
import { runDevForgeGraph } from './runDevForgeGraph';
import { DevForgeGraphState } from './types';

export interface RunPostInitGraphInput {
  config: DevForgeConfig;
  fs: DevForgeFS;
  generatedFiles: string[];
  credentials: StoredCredentials;
  failureSignals: FailureSignal[];
  lastRunJson: LastRunMetadata | null;
  noAgent?: boolean;
  skipReport?: boolean;
  verbose?: boolean;
}

export interface RunPostInitGraphOptions {
  dependencies?: PostInitGraphDependencies;
}

export async function runPostInitGraph(
  input: RunPostInitGraphInput,
  options: RunPostInitGraphOptions = {},
): Promise<DevForgeGraphState> {
  return runDevForgeGraph(
    {
      config: input.config,
      fs: input.fs,
      generatedFiles: input.generatedFiles,
      credentials: input.credentials,
      failureSignals: input.failureSignals,
      lastRunJson: input.lastRunJson,
      noAgent: input.noAgent,
      skipReport: input.skipReport,
      verbose: input.verbose,
    },
    options,
  );
}
