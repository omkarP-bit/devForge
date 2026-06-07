import { AnthropicProvider } from '../../../src/agent/providers/Anthropic';

const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
    },
  })),
}));

describe('AnthropicProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('chat() returns the model response text', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Anthropic response' }],
    });

    const provider = new AnthropicProvider({ ANTHROPIC_API_KEY: 'anthropic-key' });
    const response = await provider.chat([{ role: 'user', content: 'Hi' }]);

    expect(response).toBe('Anthropic response');
  });

  it('isAvailable() returns true when credentials are valid', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'pong' }],
    });

    const provider = new AnthropicProvider({ ANTHROPIC_API_KEY: 'anthropic-key' });
    await expect(provider.isAvailable()).resolves.toBe(true);
  });

  it('isAvailable() returns false when credentials are invalid', async () => {
    mockCreate.mockRejectedValue(new Error('authentication_error'));

    const provider = new AnthropicProvider({ ANTHROPIC_API_KEY: 'bad-key' });
    await expect(provider.isAvailable()).resolves.toBe(false);
  });

  it('isAvailable() returns false when API key is missing', async () => {
    const provider = new AnthropicProvider({});
    await expect(provider.isAvailable()).resolves.toBe(false);
  });
});
