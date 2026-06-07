import { GeminiProvider } from '../../../src/agent/providers/Gemini';

const mockSendMessage = jest.fn();
const mockGenerateContent = jest.fn();
const mockStartChat = jest.fn();
const mockGetGenerativeModel = jest.fn();

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

describe('GeminiProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetGenerativeModel.mockReturnValue({
      startChat: mockStartChat,
      generateContent: mockGenerateContent,
    });
    mockStartChat.mockReturnValue({
      sendMessage: mockSendMessage,
    });
  });

  it('chat() returns the model response text', async () => {
    mockSendMessage.mockResolvedValue({
      response: {
        text: () => 'Gemini says hello',
      },
    });

    const provider = new GeminiProvider({ GEMINI_API_KEY: 'gemini-key' });
    const response = await provider.chat([{ role: 'user', content: 'Hi' }]);

    expect(response).toBe('Gemini says hello');
  });

  it('isAvailable() returns true when credentials are valid', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'pong',
      },
    });

    const provider = new GeminiProvider({ GEMINI_API_KEY: 'gemini-key' });
    await expect(provider.isAvailable()).resolves.toBe(true);
  });

  it('isAvailable() returns false when credentials are invalid', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API key not valid'));

    const provider = new GeminiProvider({ GEMINI_API_KEY: 'bad-key' });
    await expect(provider.isAvailable()).resolves.toBe(false);
  });

  it('isAvailable() returns false when API key is missing', async () => {
    const provider = new GeminiProvider({});
    await expect(provider.isAvailable()).resolves.toBe(false);
  });
});
