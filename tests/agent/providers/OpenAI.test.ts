import { OpenAIProvider } from '../../../src/agent/providers/OpenAI';

const mockCreate = jest.fn();
const mockModelsList = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
    models: {
      list: mockModelsList,
    },
  })),
}));

describe('OpenAIProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('chat() returns the model response text', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'OpenAI response' } }],
    });

    const provider = new OpenAIProvider({ OPENAI_API_KEY: 'openai-key' });
    const response = await provider.chat([{ role: 'user', content: 'Hi' }]);

    expect(response).toBe('OpenAI response');
  });

  it('isAvailable() returns true when credentials are valid', async () => {
    mockModelsList.mockResolvedValue({ data: [] });

    const provider = new OpenAIProvider({ OPENAI_API_KEY: 'openai-key' });
    await expect(provider.isAvailable()).resolves.toBe(true);
  });

  it('isAvailable() returns false when credentials are invalid', async () => {
    mockModelsList.mockRejectedValue(new Error('Incorrect API key'));

    const provider = new OpenAIProvider({ OPENAI_API_KEY: 'bad-key' });
    await expect(provider.isAvailable()).resolves.toBe(false);
  });

  it('isAvailable() returns false when API key is missing', async () => {
    const provider = new OpenAIProvider({});
    await expect(provider.isAvailable()).resolves.toBe(false);
  });
});
