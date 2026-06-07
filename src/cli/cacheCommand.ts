import chalk from 'chalk';
import { createAgentCache } from '../agent/cache/createAgentCache';
import { testElastiCacheConnection } from '../agent/cache/testElastiCache';
import { CredentialManager } from '../agent/credentials/CredentialManager';
import { logger } from '../utils/logger';

export interface CacheCommandDependencies {
  cache?: ReturnType<typeof createAgentCache>;
  credentialManager?: CredentialManager;
}

async function resolveCache(
  dependencies: CacheCommandDependencies,
): Promise<ReturnType<typeof createAgentCache>> {
  if (dependencies.cache) {
    return dependencies.cache;
  }

  const credentialManager = dependencies.credentialManager ?? new CredentialManager();
  const credentials = await credentialManager.tryLoadCredentials();
  return createAgentCache(credentials);
}

export async function cacheClearCommand(
  dependencies: CacheCommandDependencies = {},
): Promise<void> {
  const cache = await resolveCache(dependencies);
  await cache.clear();
  logger.success('Agent cache cleared (local and ElastiCache when configured).');
}

export async function cacheStatsCommand(
  dependencies: CacheCommandDependencies = {},
): Promise<void> {
  const cache = await resolveCache(dependencies);
  const stats = await cache.getStats();

  console.log('');
  console.log(chalk.bold('DevForge Agent Cache'));
  console.log(chalk.gray('─'.repeat(40)));
  console.log(chalk.cyan(`Backend mode: ${stats.backend}`));
  console.log(chalk.cyan(`Local entries: ${stats.local.entryCount}`));
  console.log(chalk.cyan(`Local size: ${stats.local.totalSizeKb} KB`));
  console.log(
    chalk.cyan(
      `ElastiCache: ${
        stats.elasticache.enabled
          ? stats.elasticache.connected
            ? `${stats.elasticache.entryCount} keys (connected)`
            : 'configured but unavailable (local fallback active)'
          : 'disabled'
      }`,
    ),
  );
  console.log(
    chalk.cyan(
      `Oldest local entry: ${stats.oldestEntryDate ? stats.oldestEntryDate : 'N/A'}`,
    ),
  );
  console.log('');
}

export async function cacheTestElasticacheCommand(
  dependencies: CacheCommandDependencies = {},
): Promise<number> {
  const credentialManager = dependencies.credentialManager ?? new CredentialManager();
  const credentials = await credentialManager.tryLoadCredentials();
  const result = await testElastiCacheConnection({ storedCredentials: credentials });

  console.log('');
  console.log(chalk.bold('ElastiCache Connectivity Test'));
  console.log(chalk.gray('─'.repeat(40)));

  if (!result.configured) {
    console.log(chalk.yellow(result.message));
    console.log(chalk.gray('Tip: use `devforge agent reset` and pick "Amazon ElastiCache (Redis)".'));
    console.log('');
    return 1;
  }

  console.log(chalk.gray(`Host: ${result.host}:${result.port}`));
  console.log(chalk.gray(`TLS: ${result.tls ? 'enabled' : 'disabled'}`));

  if (result.latencyMs !== undefined) {
    console.log(chalk.gray(`Latency: ${result.latencyMs}ms`));
  }

  if (result.success) {
    console.log(chalk.green(`✓ ${result.message}`));
    console.log(chalk.gray('Local file cache remains available as fallback.'));
    console.log('');
    return 0;
  }

  console.log(chalk.red(`✗ ${result.message}`));
  console.log(chalk.gray('DevForge will continue using ~/.devforge/agent-cache.json as fallback.'));
  console.log('');
  return 1;
}
