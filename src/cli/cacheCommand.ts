import chalk from 'chalk';
import { AgentCache } from '../agent/cache/AgentCache';
import { logger } from '../utils/logger';

export interface CacheCommandDependencies {
  cache?: AgentCache;
}

export async function cacheClearCommand(
  dependencies: CacheCommandDependencies = {},
): Promise<void> {
  const cache = dependencies.cache ?? new AgentCache();
  await cache.clear();
  logger.success('Agent cache cleared.');
}

export async function cacheStatsCommand(
  dependencies: CacheCommandDependencies = {},
): Promise<void> {
  const cache = dependencies.cache ?? new AgentCache();
  const stats = await cache.getStats();

  console.log('');
  console.log(chalk.bold('DevForge Agent Cache'));
  console.log(chalk.gray('─'.repeat(40)));
  console.log(chalk.cyan(`Cached entries: ${stats.entryCount}`));
  console.log(chalk.cyan(`Total size: ${stats.totalSizeKb} KB`));
  console.log(
    chalk.cyan(
      `Oldest entry: ${stats.oldestEntryDate ? stats.oldestEntryDate : 'N/A'}`,
    ),
  );
  console.log('');
}
