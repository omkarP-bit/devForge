import chalk from 'chalk';
import { AgentCache } from '../agent/cache/AgentCache';
import { CredentialManager } from '../agent/credentials/CredentialManager';
import {
  formatProviderName,
  getProviderMode,
  maskCredential,
} from '../agent/providerDisplay';

export interface AgentCommandDependencies {
  credentialManager?: CredentialManager;
  cache?: AgentCache;
}

export async function agentStatusCommand(
  dependencies: AgentCommandDependencies = {},
): Promise<void> {
  const credentialManager = dependencies.credentialManager ?? new CredentialManager();
  const cache = dependencies.cache ?? new AgentCache();
  const credentials = await credentialManager.tryLoadCredentials();
  const cacheStats = await cache.getStats();

  console.log('');
  console.log(chalk.bold('DevForge AI Status'));
  console.log(chalk.gray('─'.repeat(40)));

  if (!credentials) {
    console.log(chalk.yellow('Active provider: Not configured'));
    console.log(chalk.yellow('Mode: Setup required'));
    console.log(chalk.gray(`Cache entries: ${cacheStats.entryCount}`));
    console.log(chalk.gray('Last setup: N/A'));
    console.log('');
    return;
  }

  console.log(chalk.cyan(`Active provider: ${formatProviderName(credentials.provider)}`));
  console.log(chalk.cyan(`Mode: ${getProviderMode(credentials.provider)}`));

  const credentialEntries = Object.entries(credentials.credentials);
  if (credentialEntries.length === 0) {
    console.log(chalk.gray('Credentials: none'));
  } else {
    console.log(chalk.gray('Credentials:'));
    for (const [key, value] of credentialEntries) {
      console.log(chalk.gray(`  ${key}: ${maskCredential(value)}`));
    }
  }

  console.log(chalk.gray(`Cache entries: ${cacheStats.entryCount}`));
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
