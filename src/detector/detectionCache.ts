import { DetectedProject, DetectedProjectSchema } from '../types';
import { DevForgeFS } from '../utils/fs';

const CACHE_FILE = '.devforge/detection.json';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Checks if the cached detection result is still valid (less than 24 hours old).
 */
export function isCacheValid(cache: DetectedProject): boolean {
  try {
    const detectedTime = new Date(cache.detectedAt).getTime();
    if (isNaN(detectedTime)) {
      return false;
    }
    const now = Date.now();
    const ageMs = now - detectedTime;
    return ageMs >= 0 && ageMs < CACHE_EXPIRY_MS;
  } catch {
    return false;
  }
}

/**
 * Saves a project detection result to the local cache file (.devforge/detection.json).
 */
export async function saveDetectionCache(fs: DevForgeFS, result: DetectedProject): Promise<void> {
  await fs.ensureDir('.devforge');
  await fs.writeFile(CACHE_FILE, JSON.stringify(result, null, 2));
}

/**
 * Loads and validates the cached project detection result.
 * Returns the cached project if valid, otherwise returns null.
 */
export async function loadDetectionCache(fs: DevForgeFS): Promise<DetectedProject | null> {
  try {
    if (!(await fs.fileExists(CACHE_FILE))) {
      return null;
    }

    const content = await fs.readFile(CACHE_FILE);
    const parsed = JSON.parse(content);

    const validation = DetectedProjectSchema.safeParse(parsed);
    if (!validation.success) {
      return null;
    }

    const cache = validation.data;
    if (!isCacheValid(cache)) {
      return null;
    }

    return cache;
  } catch {
    return null; // Treat corrupt cache or read failure as a cache miss
  }
}
