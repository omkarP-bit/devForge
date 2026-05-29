import { PackageManager } from '../types';
import { DevForgeFS } from '../utils/fs';
import { ParsedPackageJson } from './packageJsonParser';
import { DetectionError } from '../utils/errors';

/**
 * Detects the package manager used in the project by checking for lockfiles.
 * Falls back to NPM if none are found.
 */
export async function detectPackageManager(fs: DevForgeFS): Promise<PackageManager> {
  if (await fs.fileExists('pnpm-lock.yaml')) {
    return PackageManager.PNPM;
  }
  if (await fs.fileExists('yarn.lock')) {
    return PackageManager.YARN;
  }
  if (await fs.fileExists('package-lock.json')) {
    return PackageManager.NPM;
  }
  return PackageManager.NPM;
}

/**
 * Extracts and cleans the major version number from a version string.
 * Strips a leading 'v', trims whitespace, and matches the first sequence of digits.
 */
function cleanAndExtractMajor(versionStr: string): string | null {
  const cleaned = versionStr.trim().replace(/^v/, '');
  const match = cleaned.match(/(\d+)/);
  return match ? match[1]! : null;
}

/**
 * Detects the Node.js major version for the project.
 * Priority:
 * 1. Read `.nvmrc` if it exists (strip 'v' prefix, trim whitespace)
 * 2. Read `pkg.engines?.node` if present (extract semver, e.g. '>=18.0.0' -> '18')
 * 3. Default to '20'
 *
 * Validates the result is a numeric string between '14' and '24' (inclusive).
 * Throws a DetectionError on validation failure.
 */
export async function detectNodeVersion(fs: DevForgeFS, pkg: ParsedPackageJson): Promise<string> {
  let detectedVersion: string | null = null;

  // 1. Try `.nvmrc`
  if (await fs.fileExists('.nvmrc')) {
    try {
      const content = await fs.readFile('.nvmrc');
      const extracted = cleanAndExtractMajor(content);
      if (!extracted) {
        throw new DetectionError(`Invalid Node.js version in .nvmrc: "${content.trim()}"`);
      }
      detectedVersion = extracted;
    } catch (err) {
      if (err instanceof DetectionError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new DetectionError(`Failed to read .nvmrc: ${message}`);
    }
  }

  // 2. Try pkg.engines.node
  if (!detectedVersion && pkg.engines?.node) {
    const extracted = cleanAndExtractMajor(pkg.engines.node);
    if (!extracted) {
      throw new DetectionError(`Invalid Node.js version in engines.node: "${pkg.engines.node}"`);
    }
    detectedVersion = extracted;
  }

  // 3. Fallback to default
  const finalVersion = detectedVersion || '20';

  // Validate the result is a numeric string between '14' and '24'
  const isNumeric = /^\d+$/.test(finalVersion);
  const num = parseInt(finalVersion, 10);
  if (!isNumeric || num < 14 || num > 24) {
    throw new DetectionError(
      `Invalid Node.js version detected: "${finalVersion}". Expected a numeric version between 14 and 24.`,
    );
  }

  return finalVersion;
}

/**
 * Returns the install command for a given package manager.
 */
export function getInstallCommand(pm: PackageManager): string {
  switch (pm) {
    case PackageManager.YARN:
      return 'yarn install --frozen-lockfile';
    case PackageManager.PNPM:
      return 'pnpm install --frozen-lockfile';
    case PackageManager.NPM:
    default:
      return 'npm ci';
  }
}

/**
 * Returns the cache key config for a given package manager for use in GitHub Actions.
 */
export function getCacheKey(pm: PackageManager): { path: string; key: string } {
  switch (pm) {
    case PackageManager.YARN:
      return {
        path: '~/.yarn/cache',
        key: `yarn-\${{ hashFiles('yarn.lock') }}`,
      };
    case PackageManager.PNPM:
      return {
        path: '~/.pnpm-store',
        key: `pnpm-\${{ hashFiles('pnpm-lock.yaml') }}`,
      };
    case PackageManager.NPM:
    default:
      return {
        path: '~/.npm',
        key: `npm-\${{ hashFiles('package-lock.json') }}`,
      };
  }
}
