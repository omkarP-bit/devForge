import { AgentProviderName } from '../providers/types';

export const CREDENTIALS_VERSION = 1;

export interface StoredCredentials {
  provider: AgentProviderName;
  credentials: Record<string, string>;
  setupAt: string;
  version: number;
}

export interface PersistedCredentialsFile {
  provider: AgentProviderName;
  encryptedCredentials: string;
  setupAt: string;
  version: number;
}
