import { createHash } from 'crypto';

export function buildCacheKey(
  agentName: string,
  systemPrompt: string,
  userMessage: string,
): string {
  return createHash('sha256')
    .update(`${agentName}|${systemPrompt}|${userMessage}`)
    .digest('hex');
}
