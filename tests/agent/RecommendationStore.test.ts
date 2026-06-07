import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { RecommendationStore } from '../../src/agent/RecommendationStore';
import { Recommendation } from '../../src/agent/types';
import { DevForgeFS } from '../../src/utils/fs';

function createRecommendation(overrides?: Partial<Recommendation>): Recommendation {
  return {
    type: 'security',
    severity: 'critical',
    title: 'Pin actions',
    description: 'Pin GitHub Actions by SHA',
    autoFixAvailable: true,
    ...overrides,
  };
}

describe('RecommendationStore', () => {
  let tempDir: string;
  let devFS: DevForgeFS;
  let store: RecommendationStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-rec-store-'));
    devFS = new DevForgeFS(tempDir);
    store = new RecommendationStore(devFS, '2.0.0');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeWorkflow(name: string, content: string): Promise<void> {
    const workflowDir = path.join(tempDir, '.github', 'workflows');
    await fs.mkdir(workflowDir, { recursive: true });
    await fs.writeFile(path.join(workflowDir, name), content, 'utf-8');
  }

  it('load() returns an empty array when the store file does not exist', async () => {
    await expect(store.load()).resolves.toEqual([]);
  });

  it('save() persists new recommendations with ids and metadata', async () => {
    await store.save([createRecommendation()]);

    const stored = await store.load();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      type: 'security',
      severity: 'critical',
      title: 'Pin actions',
      status: 'new',
      devforgeVersion: '2.0.0',
    });
    expect(stored[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(stored[0]?.generatedAt).toBeTruthy();
  });

  it('save() does not duplicate recommendations with the same title and type', async () => {
    await store.save([createRecommendation()]);
    const first = (await store.load())[0];

    await store.save([
      createRecommendation({
        description: 'Updated description',
        severity: 'high',
      }),
    ]);

    const stored = await store.load();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe(first?.id);
    expect(stored[0]?.description).toBe('Updated description');
    expect(stored[0]?.severity).toBe('high');
  });

  it('save() marks disappeared recommendations as acted_on when workflow files change', async () => {
    await writeWorkflow('ci.yml', 'name: CI\njobs:\n  test:\n    runs-on: ubuntu-latest');
    await store.save([createRecommendation()]);

    await writeWorkflow('ci.yml', 'name: CI\njobs:\n  test:\n    runs-on: ubuntu-latest\n    timeout-minutes: 10');
    await store.save([
      createRecommendation({
        title: 'Enable caching',
        type: 'optimization',
        severity: 'low',
      }),
    ]);

    const stored = await store.load();
    const actedOn = stored.find((item) => item.title === 'Pin actions');
    const stillNew = stored.find((item) => item.title === 'Enable caching');

    expect(actedOn?.status).toBe('acted_on');
    expect(stillNew?.status).toBe('new');
  });

  it('dismiss() sets the recommendation status to dismissed', async () => {
    await store.save([createRecommendation()]);
    const stored = await store.load();
    const id = stored[0]?.id;
    expect(id).toBeTruthy();

    await store.dismiss(id!);

    const updated = await store.load();
    expect(updated[0]?.status).toBe('dismissed');
  });

  it('dismiss() throws when the recommendation id does not exist', async () => {
    await expect(store.dismiss('missing-id')).rejects.toThrow('Recommendation not found');
  });

  it('getSummary() returns counts grouped by status and critical new items', async () => {
    await store.save([
      createRecommendation({ title: 'Critical issue', severity: 'critical' }),
      createRecommendation({ title: 'Low issue', type: 'optimization', severity: 'low' }),
    ]);

    const stored = await store.load();
    await store.dismiss(stored.find((item) => item.title === 'Low issue')!.id);

    const summary = await store.getSummary();
    expect(summary).toEqual({
      new: 1,
      dismissed: 1,
      acted_on: 0,
      critical: 1,
    });
  });

  it('save() does not recreate dismissed recommendations with the same title and type', async () => {
    await store.save([createRecommendation()]);
    const stored = await store.load();
    await store.dismiss(stored[0]!.id);

    await store.save([createRecommendation({ description: 'Should not reopen' })]);

    const updated = await store.load();
    expect(updated).toHaveLength(1);
    expect(updated[0]?.status).toBe('dismissed');
    expect(updated[0]?.description).toBe('Pin GitHub Actions by SHA');
  });
});
