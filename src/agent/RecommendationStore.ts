import { createHash, randomUUID } from 'crypto';
import { DevForgeFS } from '../utils/fs';
import { Recommendation } from './types';

const STORE_PATH = '.devforge/recommendations.json';
const WORKFLOW_ROOT = '.github/workflows';

export interface StoredRecommendation extends Recommendation {
  id: string;
  generatedAt: string;
  status: 'new' | 'dismissed' | 'acted_on';
  devforgeVersion: string;
}

export interface RecommendationSummary {
  new: number;
  dismissed: number;
  acted_on: number;
  critical: number;
}

interface RecommendationStoreFile {
  fileHashes: Record<string, string>;
  recommendations: StoredRecommendation[];
}

export class RecommendationStore {
  private readonly devforgeVersion: string;

  constructor(
    private readonly fs: DevForgeFS,
    devforgeVersion = '1.0.0',
  ) {
    this.devforgeVersion = devforgeVersion;
  }

  async load(): Promise<StoredRecommendation[]> {
    const data = await this.readStoreFile();
    return data.recommendations;
  }

  async save(recommendations: Recommendation[]): Promise<void> {
    const data = await this.readStoreFile();
    const currentHashes = await this.computeWorkflowHashes();
    const hashesChanged = this.haveWorkflowHashesChanged(data.fileHashes, currentHashes);
    const merged = this.mergeRecommendations(data.recommendations, recommendations, hashesChanged);

    await this.writeStoreFile({
      fileHashes: currentHashes,
      recommendations: merged,
    });
  }

  async dismiss(id: string): Promise<void> {
    const data = await this.readStoreFile();
    const target = data.recommendations.find((recommendation) => recommendation.id === id);

    if (!target) {
      throw new Error(`Recommendation not found: ${id}`);
    }

    target.status = 'dismissed';
    await this.writeStoreFile(data);
  }

  async getSummary(): Promise<RecommendationSummary> {
    const recommendations = await this.load();

    return {
      new: recommendations.filter((recommendation) => recommendation.status === 'new').length,
      dismissed: recommendations.filter((recommendation) => recommendation.status === 'dismissed')
        .length,
      acted_on: recommendations.filter((recommendation) => recommendation.status === 'acted_on')
        .length,
      critical: recommendations.filter(
        (recommendation) =>
          recommendation.status === 'new' && recommendation.severity === 'critical',
      ).length,
    };
  }

  private async readStoreFile(): Promise<RecommendationStoreFile> {
    if (!(await this.fs.fileExists(STORE_PATH))) {
      return { fileHashes: {}, recommendations: [] };
    }

    try {
      const raw = await this.fs.readFile(STORE_PATH);
      const parsed = JSON.parse(raw) as Partial<RecommendationStoreFile>;

      return {
        fileHashes: parsed.fileHashes ?? {},
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      };
    } catch {
      return { fileHashes: {}, recommendations: [] };
    }
  }

  private async writeStoreFile(data: RecommendationStoreFile): Promise<void> {
    await this.fs.ensureDir('.devforge');
    await this.fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2));
  }

  private mergeRecommendations(
    existing: StoredRecommendation[],
    incoming: Recommendation[],
    hashesChanged: boolean,
  ): StoredRecommendation[] {
    const now = new Date().toISOString();
    const incomingKeys = new Set(
      incoming.map((recommendation) => recommendationKey(recommendation)),
    );
    const merged = existing.map((stored) => ({ ...stored }));

    for (const stored of merged) {
      if (stored.status !== 'new') {
        continue;
      }

      if (!incomingKeys.has(recommendationKey(stored)) && hashesChanged) {
        stored.status = 'acted_on';
      }
    }

    for (const recommendation of incoming) {
      const key = recommendationKey(recommendation);
      const match = merged.find((stored) => recommendationKey(stored) === key);

      if (match) {
        if (match.status === 'new') {
          match.type = recommendation.type;
          match.severity = recommendation.severity;
          match.title = recommendation.title;
          match.description = recommendation.description;
          match.autoFixAvailable = recommendation.autoFixAvailable;
        }
        continue;
      }

      merged.push({
        ...recommendation,
        id: randomUUID(),
        generatedAt: now,
        status: 'new',
        devforgeVersion: this.devforgeVersion,
      });
    }

    return merged;
  }

  private haveWorkflowHashesChanged(
    previous: Record<string, string>,
    current: Record<string, string>,
  ): boolean {
    const paths = new Set([...Object.keys(previous), ...Object.keys(current)]);

    for (const filePath of paths) {
      // eslint-disable-next-line security/detect-object-injection
      if (previous[filePath] !== current[filePath]) {
        return true;
      }
    }

    return false;
  }

  private async computeWorkflowHashes(): Promise<Record<string, string>> {
    const hashes: Record<string, string> = {};

    if (!(await this.fs.fileExists(WORKFLOW_ROOT))) {
      return hashes;
    }

    const files = await this.fs.listFiles(WORKFLOW_ROOT).catch(() => []);
    for (const relativePath of files) {
      if (!/\.ya?ml$/i.test(relativePath)) {
        continue;
      }

      const filePath = `${WORKFLOW_ROOT}/${relativePath.replace(/\\/g, '/')}`;
      const hash = await this.hashFile(filePath);
      if (hash) {
        // eslint-disable-next-line security/detect-object-injection
        hashes[filePath] = hash;
      }
    }

    return hashes;
  }

  private async hashFile(filePath: string): Promise<string | null> {
    try {
      const content = await this.fs.readFile(filePath);
      return createHash('sha256').update(content).digest('hex');
    } catch {
      return null;
    }
  }
}

function recommendationKey(recommendation: Recommendation): string {
  return `${recommendation.type}::${recommendation.title}`;
}
