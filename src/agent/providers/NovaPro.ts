import { LLMProvider, AgentMessage, ChatOptions } from './types';
import {
  checkBedrockAvailability,
  converseWithBedrock,
  createBedrockClient,
  hasAwsCredentials,
} from './bedrockCommon';

const MODEL_ID = 'amazon.nova-pro-v1:0';

export class NovaProProvider implements LLMProvider {
  readonly name = 'nova-pro';

  constructor(private readonly credentials: Record<string, string>) {}

  async chat(messages: AgentMessage[], options?: ChatOptions): Promise<string> {
    const client = createBedrockClient(this.credentials);
    return converseWithBedrock(client, MODEL_ID, this.name, messages, options);
  }

  async isAvailable(): Promise<boolean> {
    if (!hasAwsCredentials(this.credentials)) {
      return false;
    }

    const client = createBedrockClient(this.credentials);
    return checkBedrockAvailability(client, MODEL_ID, this.name);
  }
}
