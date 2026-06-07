import inquirer from 'inquirer';
import os from 'os';
import path from 'path';
import { resolveProvider } from '../providers/ProviderFactory';
import { AgentProviderName } from '../providers/types';
import { sanitizeString } from '../../utils/sanitizer';
import { SanitizationError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { decryptCredentials, deriveEncryptionKey, encryptCredentials } from './crypto';
import { isKnownCredentialKey } from './credentialKeyWhitelist';
import { safeAccess, safeMkdir, safeReadFile, safeUnlink, safeWriteFile } from '../../utils/safeFs';
import { CREDENTIALS_VERSION, PersistedCredentialsFile, StoredCredentials } from './types';

const PROVIDER_CHOICES: Array<{ name: string; value: AgentProviderName }> = [
  { name: 'Online - Amazon Nova Pro (recommended)', value: 'nova-pro' },
  { name: 'Online - Google Gemini', value: 'gemini' },
  { name: 'Online - OpenAI', value: 'openai' },
  { name: 'Online - Anthropic', value: 'anthropic' },
  { name: 'Online - Amazon Bedrock (custom)', value: 'bedrock' },
  { name: 'Offline - use template engine only', value: 'offline' },
];

export interface CredentialManagerOptions {
  credentialsPath?: string;
  deriveKey?: () => Buffer;
}

function getDefaultCredentialsPath(): string {
  if (process.env.DEVFORGE_CREDENTIALS_PATH) {
    return process.env.DEVFORGE_CREDENTIALS_PATH;
  }

  return path.join(os.homedir(), '.devforge', 'credentials.json');
}

function sanitizeCredentialInput(input: string): boolean | string {
  try {
    sanitizeString(input, 512);
    return true;
  } catch (error) {
    if (error instanceof SanitizationError) {
      return error.message;
    }
    return 'Invalid credential value';
  }
}

function sanitizeCredentialRecord(credentials: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(credentials)) {
    if (!isKnownCredentialKey(key)) {
      continue;
    }

    const sanitizedValue = sanitizeString(value, 512);
    assignSanitizedCredential(sanitized, key, sanitizedValue);
  }

  return sanitized;
}

function assignSanitizedCredential(
  sanitized: Record<string, string>,
  key: string,
  value: string,
): void {
  switch (key) {
    case 'AWS_ACCESS_KEY_ID':
      sanitized.AWS_ACCESS_KEY_ID = value;
      break;
    case 'AWS_SECRET_ACCESS_KEY':
      sanitized.AWS_SECRET_ACCESS_KEY = value;
      break;
    case 'AWS_REGION':
      sanitized.AWS_REGION = value;
      break;
    case 'BEDROCK_MODEL_ID':
      sanitized.BEDROCK_MODEL_ID = value;
      break;
    case 'OPENAI_API_KEY':
      sanitized.OPENAI_API_KEY = value;
      break;
    case 'ANTHROPIC_API_KEY':
      sanitized.ANTHROPIC_API_KEY = value;
      break;
    case 'GEMINI_API_KEY':
      sanitized.GEMINI_API_KEY = value;
      break;
    case 'ELASTICSEARCH_URL':
      sanitized.ELASTICSEARCH_URL = value;
      break;
    case 'ELASTICSEARCH_API_KEY':
      sanitized.ELASTICSEARCH_API_KEY = value;
      break;
    case 'ELASTICACHE_ENABLED':
      sanitized.ELASTICACHE_ENABLED = value;
      break;
    case 'ELASTICACHE_HOST':
      sanitized.ELASTICACHE_HOST = value;
      break;
    case 'ELASTICACHE_PORT':
      sanitized.ELASTICACHE_PORT = value;
      break;
    case 'ELASTICACHE_AUTH_TOKEN':
      sanitized.ELASTICACHE_AUTH_TOKEN = value;
      break;
    case 'ELASTICACHE_TLS':
      sanitized.ELASTICACHE_TLS = value;
      break;
    case 'ELASTICACHE_KEY_PREFIX':
      sanitized.ELASTICACHE_KEY_PREFIX = value;
      break;
    default:
      break;
  }
}

export class CredentialManager {
  private readonly credentialsPath: string;
  private readonly deriveKey: () => Buffer;

  constructor(options: CredentialManagerOptions = {}) {
    this.credentialsPath = options.credentialsPath ?? getDefaultCredentialsPath();
    this.deriveKey = options.deriveKey ?? deriveEncryptionKey;
  }

  async isFirstRun(): Promise<boolean> {
    try {
      await safeAccess(this.credentialsPath);
      await this.readAndDecrypt();
      return false;
    } catch {
      return true;
    }
  }

  async runFirstTimeSetup(): Promise<StoredCredentials> {
    const { provider } = await inquirer.prompt<{ provider: AgentProviderName }>([
      {
        type: 'list',
        name: 'provider',
        message: 'How do you want DevForge AI to work?',
        choices: PROVIDER_CHOICES,
        default: 'nova-pro',
      },
    ]);

    let credentials =
      provider === 'offline' ? {} : await this.promptForProviderCredentials(provider);

    if (provider !== 'offline') {
      const elasticacheCredentials = await this.promptForElasticacheCredentials();
      credentials = { ...credentials, ...elasticacheCredentials };
    }

    // Optionally prompt for agent memory (Elasticsearch) credentials
    if (provider !== 'offline') {
      const { enableAgentMemory = false } = await inquirer.prompt<{ enableAgentMemory?: boolean }>([
        {
          type: 'confirm',
          name: 'enableAgentMemory',
          message: 'Enable persistent agent memory (Elasticsearch)?',
          default: false,
        },
      ]);

      if (enableAgentMemory) {
        const answers = await inquirer.prompt<{
          ELASTICSEARCH_URL: string;
          ELASTICSEARCH_API_KEY: string;
        }>([
          {
            type: 'input',
            name: 'ELASTICSEARCH_URL',
            message: 'Elasticsearch URL (https://...):',
            validate: sanitizeCredentialInput,
          },
          {
            type: 'password',
            name: 'ELASTICSEARCH_API_KEY',
            message: 'Elasticsearch API key:',
            validate: sanitizeCredentialInput,
          },
        ]);

        credentials = {
          ...credentials,
          ELASTICSEARCH_URL: sanitizeString(answers.ELASTICSEARCH_URL, 1024),
          ELASTICSEARCH_API_KEY: sanitizeString(answers.ELASTICSEARCH_API_KEY, 1024),
        };
      }
    }

    if (provider !== 'offline') {
      const { testConnection = false } = await inquirer.prompt<{ testConnection?: boolean }>([
        {
          type: 'confirm',
          name: 'testConnection',
          message: 'Test connection?',
          default: true,
        },
      ]);

      if (testConnection) {
        await this.testProviderConnection(provider, credentials);
      }
    }

    return this.saveCredentials({
      provider,
      credentials,
      setupAt: new Date().toISOString(),
      version: CREDENTIALS_VERSION,
    });
  }

  async tryLoadCredentials(): Promise<StoredCredentials | null> {
    try {
      return await this.readAndDecrypt();
    } catch {
      return null;
    }
  }

  async clearCredentials(): Promise<void> {
    try {
      await safeUnlink(this.credentialsPath);
    } catch (error) {
      const errno = (error as NodeJS.ErrnoException).code;
      if (errno !== 'ENOENT') {
        throw error;
      }
    }
  }

  async loadCredentials(): Promise<StoredCredentials> {
    try {
      return await this.readAndDecrypt();
    } catch {
      if (process.env.CI === 'true') {
        return this.saveOfflineCredentials();
      }

      logger.warn('Stored credentials are missing or invalid. Running setup again...');
      return this.runFirstTimeSetup();
    }
  }

  async saveOfflineCredentials(): Promise<StoredCredentials> {
    return this.saveCredentials({
      provider: 'offline',
      credentials: {},
      setupAt: new Date().toISOString(),
      version: CREDENTIALS_VERSION,
    });
  }

  async saveCredentials(credentials: StoredCredentials): Promise<StoredCredentials> {
    const sanitizedCredentials = sanitizeCredentialRecord(credentials.credentials);
    const persisted: PersistedCredentialsFile = {
      provider: credentials.provider,
      encryptedCredentials: encryptCredentials(sanitizedCredentials, this.deriveKey()),
      setupAt: credentials.setupAt,
      version: credentials.version,
    };

    await safeMkdir(path.dirname(this.credentialsPath));
    await safeWriteFile(this.credentialsPath, JSON.stringify(persisted, null, 2), 'utf-8');

    return {
      ...credentials,
      credentials: sanitizedCredentials,
    };
  }

  private async readAndDecrypt(): Promise<StoredCredentials> {
    const raw = await safeReadFile(this.credentialsPath, 'utf-8');
    const persisted = JSON.parse(raw) as PersistedCredentialsFile;

    if (
      !persisted.provider ||
      typeof persisted.encryptedCredentials !== 'string' ||
      typeof persisted.setupAt !== 'string' ||
      typeof persisted.version !== 'number'
    ) {
      throw new Error('Invalid credentials file structure');
    }

    const credentials = decryptCredentials(persisted.encryptedCredentials, this.deriveKey());

    return {
      provider: persisted.provider,
      credentials: sanitizeCredentialRecord(credentials),
      setupAt: persisted.setupAt,
      version: persisted.version,
    };
  }

  private async promptForProviderCredentials(
    provider: AgentProviderName,
  ): Promise<Record<string, string>> {
    switch (provider) {
      case 'nova-pro':
        return this.promptAwsCredentials();
      case 'gemini':
        return this.promptSingleSecret('GEMINI_API_KEY', 'Enter your Gemini API key:');
      case 'openai':
        return this.promptSingleSecret('OPENAI_API_KEY', 'Enter your OpenAI API key:');
      case 'anthropic':
        return this.promptSingleSecret('ANTHROPIC_API_KEY', 'Enter your Anthropic API key:');
      case 'bedrock': {
        const awsCredentials = await this.promptAwsCredentials();
        const { modelId } = await inquirer.prompt<{ modelId: string }>([
          {
            type: 'input',
            name: 'modelId',
            message: 'Enter the Bedrock model ID:',
            validate: sanitizeCredentialInput,
          },
        ]);

        return {
          ...awsCredentials,
          BEDROCK_MODEL_ID: sanitizeString(modelId, 512),
        };
      }
      default:
        return {};
    }
  }

  private async promptAwsCredentials(): Promise<Record<string, string>> {
    const answers = await inquirer.prompt<{
      AWS_ACCESS_KEY_ID: string;
      AWS_SECRET_ACCESS_KEY: string;
      AWS_REGION: string;
    }>([
      {
        type: 'input',
        name: 'AWS_ACCESS_KEY_ID',
        message: 'Enter your AWS Access Key ID:',
        validate: sanitizeCredentialInput,
      },
      {
        type: 'password',
        name: 'AWS_SECRET_ACCESS_KEY',
        message: 'Enter your AWS Secret Access Key:',
        validate: sanitizeCredentialInput,
      },
      {
        type: 'input',
        name: 'AWS_REGION',
        message: 'Enter your AWS region:',
        default: 'us-east-1',
        validate: sanitizeCredentialInput,
      },
    ]);

    return {
      AWS_ACCESS_KEY_ID: sanitizeString(answers.AWS_ACCESS_KEY_ID, 512),
      AWS_SECRET_ACCESS_KEY: sanitizeString(answers.AWS_SECRET_ACCESS_KEY, 512),
      AWS_REGION: sanitizeString(answers.AWS_REGION, 512),
    };
  }

  private async promptSingleSecret(
    field: 'GEMINI_API_KEY' | 'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY',
    message: string,
  ): Promise<Record<string, string>> {
    const answers = await inquirer.prompt<Record<string, string>>([
      {
        type: 'password',
        name: field,
        message,
        validate: sanitizeCredentialInput,
      },
    ]);

    const answerValue =
      field === 'GEMINI_API_KEY'
        ? answers.GEMINI_API_KEY
        : field === 'OPENAI_API_KEY'
          ? answers.OPENAI_API_KEY
          : answers.ANTHROPIC_API_KEY;

    const sanitizedValue = sanitizeString(answerValue ?? '', 512);
    switch (field) {
      case 'GEMINI_API_KEY':
        return { GEMINI_API_KEY: sanitizedValue };
      case 'OPENAI_API_KEY':
        return { OPENAI_API_KEY: sanitizedValue };
      case 'ANTHROPIC_API_KEY':
        return { ANTHROPIC_API_KEY: sanitizedValue };
    }
  }

  private async promptForElasticacheCredentials(): Promise<Record<string, string>> {
    const { cacheMode } = await inquirer.prompt<{ cacheMode: 'local' | 'elasticache' }>([
      {
        type: 'list',
        name: 'cacheMode',
        message: 'How should DevForge cache LLM responses?',
        choices: [
          {
            name: 'Local file cache (~/.devforge/agent-cache.json) — best for solo dev',
            value: 'local',
          },
          {
            name: 'Amazon ElastiCache (Redis) — shared cloud cache for teams/CI',
            value: 'elasticache',
          },
        ],
        default: 'local',
      },
    ]);

    if (cacheMode === 'local') {
      return { ELASTICACHE_ENABLED: 'false' };
    }

    return this.promptAndTestElasticacheCredentials();
  }

  private async promptAndTestElasticacheCredentials(): Promise<Record<string, string>> {
    const answers = await inquirer.prompt<{
      ELASTICACHE_HOST: string;
      ELASTICACHE_PORT: string;
      ELASTICACHE_AUTH_TOKEN: string;
      ELASTICACHE_TLS: boolean;
    }>([
      {
        type: 'input',
        name: 'ELASTICACHE_HOST',
        message: 'ElastiCache primary endpoint (e.g. my-cluster.xxxxx.cache.amazonaws.com):',
        validate: sanitizeCredentialInput,
      },
      {
        type: 'input',
        name: 'ELASTICACHE_PORT',
        message: 'Port:',
        default: '6379',
        validate: sanitizeCredentialInput,
      },
      {
        type: 'password',
        name: 'ELASTICACHE_AUTH_TOKEN',
        message: 'AUTH token (leave blank if encryption-in-transit only):',
        validate: (input: string) => input.length === 0 || sanitizeCredentialInput(input),
      },
      {
        type: 'confirm',
        name: 'ELASTICACHE_TLS',
        message: 'Use TLS? (required for ElastiCache Serverless and in-transit encryption)',
        default: true,
      },
    ]);

    const result: Record<string, string> = {
      ELASTICACHE_ENABLED: 'true',
      ELASTICACHE_HOST: sanitizeString(answers.ELASTICACHE_HOST, 255),
      ELASTICACHE_PORT: sanitizeString(answers.ELASTICACHE_PORT, 16),
      ELASTICACHE_TLS: answers.ELASTICACHE_TLS ? 'true' : 'false',
    };

    if (answers.ELASTICACHE_AUTH_TOKEN.trim().length > 0) {
      result.ELASTICACHE_AUTH_TOKEN = sanitizeString(answers.ELASTICACHE_AUTH_TOKEN, 512);
    }

    const { testNow } = await inquirer.prompt<{ testNow: boolean }>([
      {
        type: 'confirm',
        name: 'testNow',
        message: 'Test ElastiCache connection now?',
        default: true,
      },
    ]);

    if (testNow) {
      await this.testElasticacheConnection(result);
    }

    return result;
  }

  private async testElasticacheConnection(credentials: Record<string, string>): Promise<void> {
    const { testElastiCacheConnection } = await import('../cache/testElastiCache');
    const result = await testElastiCacheConnection({ credentials });

    if (result.success) {
      logger.success(result.message);
      return;
    }

    logger.warn(result.message);
    logger.info('Credentials will still be saved. Local file cache remains available as fallback.');
    logger.info('Run `devforge cache test-elasticache` anytime to re-check connectivity.');
  }

  private async testProviderConnection(
    provider: AgentProviderName,
    credentials: Record<string, string>,
  ): Promise<void> {
    const llmProvider = resolveProvider({ provider, credentials });
    const available = await llmProvider.isAvailable();

    if (available) {
      logger.success('Connection test successful!');
      return;
    }

    logger.warn('Connection test failed. Credentials will still be saved.');
  }
}
