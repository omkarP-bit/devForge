import { GoogleGenerativeAI } from '@google/generative-ai';
import { LLMProvider, AgentMessage, ChatOptions } from './types';
import { withTimeout } from './timeout';

const MODEL_ID = 'gemini-1.5-flash';

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';

  constructor(private readonly credentials: Record<string, string>) {}

  private getClient(): GoogleGenerativeAI | null {
    const apiKey = this.credentials.GEMINI_API_KEY;
    if (!apiKey) {
      return null;
    }
    return new GoogleGenerativeAI(apiKey);
  }

  async chat(messages: AgentMessage[], options?: ChatOptions): Promise<string> {
    const client = this.getClient();
    if (!client) {
      throw new Error('GEMINI_API_KEY is required');
    }

    const systemInstruction =
      options?.systemPrompt ??
      (messages
        .filter((message) => message.role === 'system')
        .map((message) => message.content)
        .join('\n') || undefined);

    const conversation = messages.filter((message) => message.role !== 'system');
    const history = conversation.slice(0, -1).map((message) => ({
      role: message.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: message.content }],
    }));
    const lastMessage = conversation[conversation.length - 1];
    const prompt = lastMessage?.content ?? '';

    const model = client.getGenerativeModel({
      model: MODEL_ID,
      systemInstruction,
      generationConfig: {
        maxOutputTokens: options?.maxTokens,
        temperature: options?.temperature,
      },
    });

    const chat = model.startChat({ history });
    const result = await withTimeout(chat.sendMessage(prompt), this.name);
    const text = result.response.text();

    if (!text) {
      throw new Error('gemini returned an empty response');
    }

    return text;
  }

  async isAvailable(): Promise<boolean> {
    const client = this.getClient();
    if (!client) {
      return false;
    }

    try {
      const model = client.getGenerativeModel({ model: MODEL_ID });
      await withTimeout(model.generateContent('ping'), this.name);
      return true;
    } catch {
      return false;
    }
  }
}
