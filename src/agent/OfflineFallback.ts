import { StoredCredentials } from './credentials/types';
import { AgentContext, AgentResult } from './types';

export function isOfflineMode(credentials: StoredCredentials): boolean {
  return credentials.provider === 'offline';
}

export function getOfflineFallbackResult(agentName: string, _context: AgentContext): AgentResult {
  return {
    agentName,
    success: true,
    messages: [
      {
        type: 'info',
        text:
          'DevForge is running in offline mode. AI-powered recommendations are disabled.\n' +
          'Using template-based generation (v1 engine).',
      },
    ],
    recommendations: [],
    warnings: [],
  };
}
