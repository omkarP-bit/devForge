import { RecommendationAgent } from '../../../src/agent/agents/RecommendationAgent';
import { StoredCredentials } from '../../../src/agent/credentials/types';
import { AgentContext } from '../../../src/agent/types';
import ElasticMemoryStore from '../../../src/agent/memory/ElasticMemoryStore';

const mockProvider: any = {
  name: 'mock',
  isAvailable: async () => true,
  chat: async () =>
    JSON.stringify({
      recommendations: [
        { type: 'update', severity: 'low', title: 'New Issue', description: 'Do X', autoFixAvailable: false },
      ],
      expectedOutputs: ['Do something'],
    }),
};

describe('RecommendationAgent memory integration', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('attaches change summary when past memories exist', async () => {
    const storedCredentials: StoredCredentials = {
      provider: 'openai',
      credentials: { ELASTICSEARCH_URL: 'http://x', ELASTICSEARCH_API_KEY: 'k' },
      setupAt: new Date().toISOString(),
      version: 1,
    };

    // Mock retrieve to return a previous recommendation and avoid network calls on store
    jest.spyOn(ElasticMemoryStore.prototype as any, 'retrieve').mockResolvedValue([
      { data: { recommendations: [{ title: 'Existing Issue' }] }, timestamp: new Date().toISOString() },
    ]);
    jest.spyOn(ElasticMemoryStore.prototype as any, 'store').mockResolvedValue(undefined);

    const recommendationStore: any = {
      load: async () => [
        { id: '1', title: 'Existing Issue', status: 'new', severity: 'low', type: 'update', description: 'Old', generatedAt: new Date().toISOString(), devforgeVersion: '2.0.0' },
        { id: '2', title: 'Old Issue', status: 'acted_on', severity: 'low', type: 'update', description: 'Old acted', generatedAt: new Date().toISOString(), devforgeVersion: '2.0.0' },
      ],
      save: async () => undefined,
    };

    const agent = new RecommendationAgent(mockProvider, storedCredentials, undefined, recommendationStore);

    const ctx: AgentContext = { config: { projectRoot: '.', detected: { framework: 'unknown', packageManager: 'npm', nodeVersion: '18', installCommand: 'npm ci' }, user: { deploymentTarget: 'docker', branchStrategy: 'feature-main', dockerRequired: false, multiEnvironment: false, environments: [], enableTrivyScan: false }, dryRun: false, generatedAt: new Date().toISOString(), devforgeVersion: '2.0.0' } as any, generatedFiles: [], lastRunJson: null, failureSignals: [] };

    const res = await agent.run(ctx as any);
    expect(Array.isArray(res.messages) && res.messages.length > 0).toBeTruthy();
    expect(res.messages.some((m) => typeof m.text === 'string' && m.text.startsWith('Changes since last scan'))).toBe(true);
  });
});
