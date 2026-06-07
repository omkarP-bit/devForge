import chalk from 'chalk';
import { createAgentCache } from '../agent/cache/createAgentCache';
import { CredentialManager } from '../agent/credentials';
import { createGraphCheckpointer } from '../agent/graph/checkpointing';
import { GraphMemory } from '../agent/graph/GraphMemory';
import { DevForgeFS } from '../utils/fs';
import { logger } from '../utils/logger';

export interface GraphCommandDependencies {
  credentialManager?: CredentialManager;
  projectRoot?: string;
}

export async function agentGraphStatusCommand(
  dependencies: GraphCommandDependencies = {},
): Promise<void> {
  const projectRoot = dependencies.projectRoot ?? process.cwd();
  const fs = new DevForgeFS(projectRoot);
  const memory = new GraphMemory(fs, projectRoot);
  const namespace = memory.getProjectNamespace();
  const credentialManager = dependencies.credentialManager ?? new CredentialManager();
  const credentials = await credentialManager.tryLoadCredentials();
  const checkpointer = createGraphCheckpointer(credentials);
  const checkpoint = await checkpointer.load(namespace);
  const lastRun = await memory.loadLastRun();
  const cache = createAgentCache(credentials);
  const cacheStats = await cache.getStats();

  console.log('');
  console.log(chalk.bold('DevForge Agent Graph'));
  console.log(chalk.gray('─'.repeat(40)));
  console.log(chalk.cyan(`Project namespace: ${namespace}`));

  if (!lastRun) {
    console.log(chalk.yellow('Last graph run: none recorded'));
  } else {
    console.log(chalk.cyan(`Last phase: ${lastRun.phase}`));
    console.log(chalk.gray(`Started: ${lastRun.startedAt}`));
    console.log(chalk.gray(`Completed: ${lastRun.completedAt}`));
    console.log(chalk.gray(`Recommendations: ${lastRun.recommendationCount}`));
    console.log(chalk.gray(`Security warnings: ${lastRun.securityWarningCount}`));
    console.log(chalk.gray(`Violations: ${lastRun.violationCount}`));

    if (lastRun.nodeTimings.length > 0) {
      console.log(chalk.gray('Node timings:'));
      for (const timing of lastRun.nodeTimings) {
        console.log(chalk.gray(`  ${timing.node}: ${timing.durationMs}ms`));
      }
    }
  }

  console.log(
    chalk.gray(
      `Checkpoint: ${checkpoint ? 'available' : 'none'} | Cache: ${cacheStats.backend} (${cacheStats.local.entryCount} local entries)`,
    ),
  );
  console.log('');

  await checkpointer.disconnect();
}

export async function agentGraphResetCommand(
  dependencies: GraphCommandDependencies = {},
): Promise<void> {
  const projectRoot = dependencies.projectRoot ?? process.cwd();
  const fs = new DevForgeFS(projectRoot);
  const memory = new GraphMemory(fs, projectRoot);
  const namespace = memory.getProjectNamespace();
  const credentialManager = dependencies.credentialManager ?? new CredentialManager();
  const credentials = await credentialManager.tryLoadCredentials();
  const checkpointer = createGraphCheckpointer(credentials);

  await memory.clear();
  await checkpointer.clear(namespace);
  await checkpointer.disconnect();

  logger.success(`Cleared graph memory and checkpoints for namespace ${namespace}.`);
}
