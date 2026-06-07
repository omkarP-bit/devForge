import { access, mkdir, readFile, unlink, writeFile } from 'fs/promises';
import inquirer from 'inquirer';
import os from 'os';
import path from 'path';
import { resolveProvider } from '../providers/ProviderFactory';
import { AgentProviderName } from '../providers/types';
import { sanitizeString } from '../../utils/sanitizer';
import { SanitizationError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { decryptCredentials, deriveEncryptionKey, encryptCredentials } from './crypto';
import {
  CREDENTIALS_VERSION,
  PersistedCredentialsFile,
  StoredCredentials,
} from './types';

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
    sanitized[key] = sanitizeString(value, 512);
  }

  return sanitized;
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
      await access(this.credentialsPath);
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

    const credentials =
      provider === 'offline' ? {} : await this.promptForProviderCredentials(provider);

    if (provider !== 'offline') {
      const { testConnection } = await inquirer.prompt<{ testConnection: boolean }>([
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
      await unlink(this.credentialsPath);
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

    await mkdir(path.dirname(this.credentialsPath), { recursive: true });
    await writeFile(this.credentialsPath, JSON.stringify(persisted, null, 2), 'utf-8');

    return {
      ...credentials,
      credentials: sanitizedCredentials,
    };
  }

  private async readAndDecrypt(): Promise<StoredCredentials> {
    const raw = await readFile(this.credentialsPath, 'utf-8');
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
    field: string,
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

    return {
      [field]: sanitizeString(answers[field] ?? '', 512),
    };
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
