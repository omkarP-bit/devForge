import { NovaProProvider } from '../../../src/agent/providers/NovaPro';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  ConverseCommand: jest.fn().mockImplementation((input) => input),
}));

describe('NovaProProvider', () => {
  const credentials = {
    AWS_ACCESS_KEY_ID: 'access-key',
    AWS_SECRET_ACCESS_KEY: 'secret-key',
    AWS_REGION: 'us-east-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('chat() returns the model response text', async () => {
    mockSend.mockResolvedValue({
      output: {
        message: {
          content: [{ text: 'Hello from Nova' }],
        },
      },
    });

    const provider = new NovaProProvider(credentials);
    const response = await provider.chat([{ role: 'user', content: 'Hi' }]);

    expect(response).toBe('Hello from Nova');
    expect(mockSend).toHaveBeenCalled();
  });

  it('isAvailable() returns true when credentials are valid', async () => {
    mockSend.mockResolvedValue({
      output: {
        message: {
          content: [{ text: 'pong' }],
        },
      },
    });

    const provider = new NovaProProvider(credentials);
    await expect(provider.isAvailable()).resolves.toBe(true);
  });

  it('isAvailable() returns false when credentials are invalid', async () => {
    mockSend.mockRejectedValue(new Error('Invalid credentials'));

    const provider = new NovaProProvider(credentials);
    await expect(provider.isAvailable()).resolves.toBe(false);
  });

  it('isAvailable() returns false when AWS credentials are missing', async () => {
    const provider = new NovaProProvider({});
    await expect(provider.isAvailable()).resolves.toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
