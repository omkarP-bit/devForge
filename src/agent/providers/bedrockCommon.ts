import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type SystemContentBlock,
} from '@aws-sdk/client-bedrock-runtime';
import { AgentMessage, ChatOptions } from './types';
import { withTimeout } from './timeout';

export function createBedrockClient(credentials: Record<string, string>): BedrockRuntimeClient {
  return new BedrockRuntimeClient({
    region: credentials.AWS_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: credentials.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: credentials.AWS_SECRET_ACCESS_KEY ?? '',
    },
  });
}

export function hasAwsCredentials(credentials: Record<string, string>): boolean {
  return Boolean(credentials.AWS_ACCESS_KEY_ID && credentials.AWS_SECRET_ACCESS_KEY);
}

function toBedrockMessages(messages: AgentMessage[]): {
  bedrockMessages: Message[];
  systemBlocks: SystemContentBlock[];
} {
  const systemBlocks: SystemContentBlock[] = [];
  const bedrockMessages: Message[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systemBlocks.push({ text: message.content });
      continue;
    }

    bedrockMessages.push({
      role: message.role,
      content: [{ text: message.content }],
    });
  }

  return { bedrockMessages, systemBlocks };
}

export async function converseWithBedrock(
  client: BedrockRuntimeClient,
  modelId: string,
  providerName: string,
  messages: AgentMessage[],
  options?: ChatOptions,
): Promise<string> {
  const { bedrockMessages, systemBlocks } = toBedrockMessages(messages);
  const systemPrompt = options?.systemPrompt
    ? [{ text: options.systemPrompt }]
    : systemBlocks;

  const command = new ConverseCommand({
    modelId,
    messages: bedrockMessages,
    system: systemPrompt.length > 0 ? systemPrompt : undefined,
    inferenceConfig: {
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
    },
  });

  const response = await withTimeout(client.send(command), providerName);
  const text = response.output?.message?.content?.[0]?.text;

  if (!text) {
    throw new Error(`${providerName} returned an empty response`);
  }

  return text;
}

export async function checkBedrockAvailability(
  client: BedrockRuntimeClient,
  modelId: string,
  providerName: string,
): Promise<boolean> {
  try {
    await withTimeout(
      client.send(
        new ConverseCommand({
          modelId,
          messages: [{ role: 'user', content: [{ text: 'ping' }] }],
          inferenceConfig: { maxTokens: 1 },
        }),
      ),
      providerName,
    );
    return true;
  } catch {
    return false;
  }
}
