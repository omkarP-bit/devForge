import { BedrockProvider } from '../../../src/agent/providers/Bedrock';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  ConverseCommand: jest.fn().mockImplementation((input) => input),
}));

describe('BedrockProvider', () => {
  const credentials = {
    AWS_ACCESS_KEY_ID: 'access-key',
    AWS_SECRET_ACCESS_KEY: 'secret-key',
    BEDROCK_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('chat() returns the model response text', async () => {
    mockSend.mockResolvedValue({
      output: {
        message: {
          content: [{ text: 'Bedrock response' }],
        },
      },
    });

    const provider = new BedrockProvider(credentials);
    const response = await provider.chat([{ role: 'user', content: 'Hi' }]);

    expect(response).toBe('Bedrock response');
  });

  it('isAvailable() returns false when model ID is missing', async () => {
    const provider = new BedrockProvider({
      AWS_ACCESS_KEY_ID: 'access-key',
      AWS_SECRET_ACCESS_KEY: 'secret-key',
    });
    await expect(provider.isAvailable()).resolves.toBe(false);
  });

  it('isAvailable() returns false when credentials are invalid', async () => {
    mockSend.mockRejectedValue(new Error('Access denied'));

    const provider = new BedrockProvider(credentials);
    await expect(provider.isAvailable()).resolves.toBe(false);
  });
});
