import { AgentRuntime } from '../agent/AgentRuntime';
import { SecurityComplianceAgent } from '../agent/agents/SecurityComplianceAgent';
import { createAgentCache } from '../agent/cache/createAgentCache';
import { CredentialManager } from '../agent/credentials';
import { StoredCredentials } from '../agent/credentials/types';
import { resolveProvider } from '../agent/providers/ProviderFactory';
import { LLMProvider } from '../agent/providers/types';
import { AgentContext } from '../agent/types';
import { DevForgeConfig } from '../types';
import { DevForgeFS } from '../utils/fs';

export async function runSecurityBackgroundAgent(
  config: DevForgeConfig,
  fs: DevForgeFS,
  generatedFiles: string[],
): Promise<void> {
  const credentials = await loadCredentials();
  if (!credentials) return;

  const provider = buildProvider(credentials);
  const readFile = (p: string) => fs.readFile(p);

  const agent = new SecurityComplianceAgent(
    provider,
    credentials,
    createAgentCache(credentials),
    readFile,
  );

  const context: AgentContext = {
    config,
    generatedFiles,
    lastRunJson: null,
    failureSignals: [],
  };

  const runtime = new AgentRuntime();
  runtime.runBackground(agent, context);
}

async function loadCredentials(): Promise<StoredCredentials | null> {
  try {
    const manager = new CredentialManager();
    if (await manager.isFirstRun()) return null;
    return await manager.loadCredentials();
  } catch {
    return null;
  }
}

function buildProvider(credentials: StoredCredentials): LLMProvider {
  if (credentials.provider === 'offline') {
    return { name: 'offline', chat: async () => '', isAvailable: async () => false };
  }
  return resolveProvider({ provider: credentials.provider, credentials: credentials.credentials });
}
