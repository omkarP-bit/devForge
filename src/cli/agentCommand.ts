import chalk from 'chalk';
import { createAgentCache } from '../agent/cache/createAgentCache';
import { isElasticacheCredentialKey } from '../agent/cache/elasticacheConfig';
import { CredentialManager } from '../agent/credentials/CredentialManager';
import {
  formatProviderName,
  getProviderMode,
  maskCredential,
} from '../agent/providerDisplay';

export interface AgentCommandDependencies {
  credentialManager?: CredentialManager;
  cache?: ReturnType<typeof createAgentCache>;
}

export async function agentStatusCommand(
  dependencies: AgentCommandDependencies = {},
): Promise<void> {
  const credentialManager = dependencies.credentialManager ?? new CredentialManager();
  const credentials = await credentialManager.tryLoadCredentials();
  const cache = dependencies.cache ?? createAgentCache(credentials);
  const cacheStats = await cache.getStats();

  console.log('');
  console.log(chalk.bold('DevForge AI Status'));
  console.log(chalk.gray('─'.repeat(40)));

  if (!credentials) {
    console.log(chalk.yellow('Active provider: Not configured'));
    console.log(chalk.yellow('Mode: Setup required'));
    console.log(chalk.gray(`Cache backend: ${cacheStats.backend}`));
    console.log(chalk.gray(`Local cache entries: ${cacheStats.local.entryCount}`));
    console.log(chalk.gray('Last setup: N/A'));
    console.log('');
    return;
  }

  console.log(chalk.cyan(`Active provider: ${formatProviderName(credentials.provider)}`));
  console.log(chalk.cyan(`Mode: ${getProviderMode(credentials.provider)}`));

  const providerCredentialEntries = Object.entries(credentials.credentials).filter(
    ([key]) => !isElasticacheCredentialKey(key),
  );
  const elasticacheCredentialEntries = Object.entries(credentials.credentials).filter(([key]) =>
    isElasticacheCredentialKey(key),
  );

  if (providerCredentialEntries.length === 0) {
    console.log(chalk.gray('Credentials: none'));
  } else {
    console.log(chalk.gray('Credentials:'));
    for (const [key, value] of providerCredentialEntries) {
      console.log(chalk.gray(`  ${key}: ${maskCredential(value)}`));
    }
  }

  if (elasticacheCredentialEntries.length > 0) {
    console.log(chalk.gray('ElastiCache:'));
    for (const [key, value] of elasticacheCredentialEntries) {
      if (key === 'ELASTICACHE_AUTH_TOKEN') {
        console.log(chalk.gray(`  ${key}: ${maskCredential(value)}`));
        continue;
      }
      console.log(chalk.gray(`  ${key}: ${value}`));
    }
  }

  console.log(chalk.gray(`Cache backend: ${cacheStats.backend}`));
  console.log(chalk.gray(`Local cache entries: ${cacheStats.local.entryCount}`));
  console.log(
    chalk.gray(
      `ElastiCache: ${
        cacheStats.elasticache.enabled
          ? cacheStats.elasticache.connected
            ? `connected (${cacheStats.elasticache.entryCount} keys)`
            : 'configured (unavailable — using local fallback)'
          : 'disabled'
      }`,
    ),
  );
  console.log(chalk.gray(`Last setup: ${credentials.setupAt}`));
  console.log('');
}

export async function agentResetCommand(
  dependencies: AgentCommandDependencies = {},
): Promise<void> {
  const credentialManager = dependencies.credentialManager ?? new CredentialManager();

  await credentialManager.clearCredentials();

  if (process.env.CI === 'true') {
    await credentialManager.saveOfflineCredentials();
    console.log('');
    console.log(chalk.green('AI provider reset to offline mode.'));
    console.log('');
    return;
  }

  await credentialManager.runFirstTimeSetup();
  console.log('');
  console.log(chalk.green('AI provider reconfigured successfully.'));
  console.log('');
}
