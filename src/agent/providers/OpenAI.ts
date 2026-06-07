import OpenAI from 'openai';
import { LLMProvider, AgentMessage, ChatOptions } from './types';
import { withTimeout } from './timeout';

const MODEL_ID = 'gpt-4o-mini';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';

  constructor(private readonly credentials: Record<string, string>) {}

  private getClient(): OpenAI | null {
    const apiKey = this.credentials.OPENAI_API_KEY;
    if (!apiKey) {
      return null;
    }
    return new OpenAI({ apiKey });
  }

  private toOpenAIMessages(
    messages: AgentMessage[],
    options?: ChatOptions,
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const openAIMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    if (options?.systemPrompt) {
      openAIMessages.push({ role: 'system', content: options.systemPrompt });
    }

    for (const message of messages) {
      if (message.role === 'system') {
        if (!options?.systemPrompt) {
          openAIMessages.push({ role: 'system', content: message.content });
        }
        continue;
      }

      openAIMessages.push({
        role: message.role,
        content: message.content,
      });
    }

    return openAIMessages;
  }

  async chat(messages: AgentMessage[], options?: ChatOptions): Promise<string> {
    const client = this.getClient();
    if (!client) {
      throw new Error('OPENAI_API_KEY is required');
    }

    const response = await withTimeout(
      client.chat.completions.create({
        model: MODEL_ID,
        messages: this.toOpenAIMessages(messages, options),
        max_tokens: options?.maxTokens,
        temperature: options?.temperature,
      }),
      this.name,
    );

    const text = response.choices[0]?.message?.content;
    if (!text) {
      throw new Error('openai returned an empty response');
    }

    return text;
  }

  async isAvailable(): Promise<boolean> {
    const client = this.getClient();
    if (!client) {
      return false;
    }

    try {
      await withTimeout(client.models.list(), this.name);
      return true;
    } catch {
      return false;
    }
  }
}
