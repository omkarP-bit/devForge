import { LLMProvider, AgentMessage, ChatOptions } from './types';
import {
  checkBedrockAvailability,
  converseWithBedrock,
  createBedrockClient,
  hasAwsCredentials,
} from './bedrockCommon';

export class BedrockProvider implements LLMProvider {
  readonly name = 'bedrock';

  constructor(private readonly credentials: Record<string, string>) {}

  private getModelId(): string {
    return this.credentials.BEDROCK_MODEL_ID ?? this.credentials.MODEL_ID ?? '';
  }

  async chat(messages: AgentMessage[], options?: ChatOptions): Promise<string> {
    const modelId = this.getModelId();
    if (!modelId) {
      throw new Error('Bedrock model ID is required (BEDROCK_MODEL_ID or MODEL_ID)');
    }

    const client = createBedrockClient(this.credentials);
    return converseWithBedrock(client, modelId, this.name, messages, options);
  }

  async isAvailable(): Promise<boolean> {
    const modelId = this.getModelId();
    if (!modelId || !hasAwsCredentials(this.credentials)) {
      return false;
    }

    const client = createBedrockClient(this.credentials);
    return checkBedrockAvailability(client, modelId, this.name);
  }
}
