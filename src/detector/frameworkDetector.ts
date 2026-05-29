/* eslint-disable security/detect-object-injection */
import { Framework, PackageManager } from '../types';
import { DevForgeFS } from '../utils/fs';
import { ParsedPackageJson } from './packageJsonParser';

// ── Detection Rule Interface ─────────────────────────────────────────

export interface DetectionRule {
  framework: Framework;
  confidence: number; // 1-100
  check: (pkg: ParsedPackageJson, fs: DevForgeFS) => Promise<boolean>;
}

// ── Detection Rules (highest confidence first) ──────────────────────

const DETECTION_RULES: DetectionRule[] = [
  {
    framework: Framework.NESTJS,
    confidence: 95,
    check: async (pkg) => pkg.hasField('@nestjs/core') && pkg.hasField('@nestjs/common'),
  },
  {
    framework: Framework.NEXTJS,
    confidence: 90,
    check: async (pkg) => pkg.hasField('next') && pkg.hasField('react'),
  },
  {
    framework: Framework.ANGULAR,
    confidence: 90,
    check: async (pkg) => pkg.hasField('@angular/core'),
  },
  {
    framework: Framework.MERN,
    confidence: 85,
    check: async (pkg) =>
      pkg.hasField('mongoose') && pkg.hasField('express') && pkg.hasField('react'),
  },
  {
    framework: Framework.VUE,
    confidence: 85,
    check: async (pkg) => pkg.hasField('vue'),
  },
  {
    framework: Framework.REACT,
    confidence: 80,
    check: async (pkg) => pkg.hasField('react') && !pkg.hasField('next'),
  },
  {
    framework: Framework.EXPRESS,
    confidence: 75,
    check: async (pkg) => pkg.hasField('express') && !pkg.hasField('mongoose'),
  },
];

// ── Framework Detection ──────────────────────────────────────────────

/**
 * Runs all detection rules against the parsed package.json and returns
 * the framework with the highest confidence score.
 * Returns Framework.UNKNOWN if no rule matches.
 */
export async function detectFramework(pkg: ParsedPackageJson, fs: DevForgeFS): Promise<Framework> {
  const matches: { framework: Framework; confidence: number }[] = [];

  for (const rule of DETECTION_RULES) {
    const matched = await rule.check(pkg, fs);
    if (matched) {
      matches.push({ framework: rule.framework, confidence: rule.confidence });
    }
  }

  if (matches.length === 0) {
    return Framework.UNKNOWN;
  }

  // Sort descending by confidence and return the top match
  matches.sort((a, b) => b.confidence - a.confidence);
  return matches[0]!.framework;
}

// ── Project Metadata Detection ───────────────────────────────────────

export interface ProjectMeta {
  hasDocker: boolean;
  hasTests: boolean;
  hasLinting: boolean;
  testCommand: string | null;
  buildCommand: string | null;
  installCommand: string;
}

/**
 * Detects project metadata: Docker presence, test/lint tooling,
 * and relevant npm script commands.
 */
export async function detectProjectMeta(
  pkg: ParsedPackageJson,
  fs: DevForgeFS,
  packageManager: PackageManager,
): Promise<ProjectMeta> {
  // Docker detection
  const [hasDockerfile, hasCompose] = await Promise.all([
    fs.fileExists('Dockerfile'),
    fs.fileExists('docker-compose.yml'),
  ]);
  const hasDocker = hasDockerfile || hasCompose;

  // Test detection: check scripts.test OR devDependencies for test frameworks
  const hasTestScript = pkg.hasScript('test');
  const hasTestFramework = pkg.hasField('jest') || pkg.hasField('vitest') || pkg.hasField('mocha');
  const hasTests = hasTestScript || hasTestFramework;

  // Linting detection
  const hasLinting = pkg.hasField('eslint') || pkg.hasField('tslint') || pkg.hasField('biome');

  // Command extraction
  const testCommand = pkg.scripts['test'] ?? null;
  const buildCommand = pkg.scripts['build'] ?? null;

  // Install command derivation
  let installCommand: string;
  switch (packageManager) {
    case PackageManager.YARN:
      installCommand = 'yarn install --frozen-lockfile';
      break;
    case PackageManager.PNPM:
      installCommand = 'pnpm install --frozen-lockfile';
      break;
    case PackageManager.NPM:
    default:
      installCommand = 'npm ci';
      break;
  }

  return {
    hasDocker,
    hasTests,
    hasLinting,
    testCommand,
    buildCommand,
    installCommand,
  };
}
