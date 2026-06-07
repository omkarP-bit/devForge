import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, AgentMessage, ChatOptions } from './types';
import { withTimeout } from './timeout';

const MODEL_ID = 'claude-3-5-haiku-20241022';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';

  constructor(private readonly credentials: Record<string, string>) {}

  private getClient(): Anthropic | null {
    const apiKey = this.credentials.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return null;
    }
    return new Anthropic({ apiKey });
  }

  private toAnthropicMessages(messages: AgentMessage[]): Anthropic.MessageParam[] {
    return messages
      .filter(
        (message): message is AgentMessage & { role: 'user' | 'assistant' } =>
          message.role !== 'system',
      )
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));
  }

  private getSystemPrompt(messages: AgentMessage[], options?: ChatOptions): string | undefined {
    if (options?.systemPrompt) {
      return options.systemPrompt;
    }

    const systemMessages = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content);

    if (systemMessages.length === 0) {
      return undefined;
    }

    return systemMessages.join('\n');
  }

  async chat(messages: AgentMessage[], options?: ChatOptions): Promise<string> {
    const client = this.getClient();
    if (!client) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }

    const response = await withTimeout(
      client.messages.create({
        model: MODEL_ID,
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature,
        system: this.getSystemPrompt(messages, options),
        messages: this.toAnthropicMessages(messages),
      }),
      this.name,
    );

    const textBlock = response.content.find((block) => block.type === 'text');
    const text = textBlock?.type === 'text' ? textBlock.text : undefined;

    if (!text) {
      throw new Error('anthropic returned an empty response');
    }

    return text;
  }

  async isAvailable(): Promise<boolean> {
    const client = this.getClient();
    if (!client) {
      return false;
    }

    try {
      await withTimeout(
        client.messages.create({
          model: MODEL_ID,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
        this.name,
      );
      return true;
    } catch {
      return false;
    }
  }
}
