import { z } from 'zod';
import { ValidationError } from '../utils/errors';

// ── Enums ────────────────────────────────────────────────────────────

export enum Framework {
  REACT = 'react',
  NEXTJS = 'nextjs',
  EXPRESS = 'express',
  NESTJS = 'nestjs',
  VUE = 'vue',
  ANGULAR = 'angular',
  MERN = 'mern',
  UNKNOWN = 'unknown',
}

export enum PackageManager {
  NPM = 'npm',
  YARN = 'yarn',
  PNPM = 'pnpm',
}

export enum DeploymentTarget {
  VERCEL = 'vercel',
  RAILWAY = 'railway',
  RENDER = 'render',
  FIREBASE = 'firebase',
  AWS_EC2 = 'aws_ec2',
  DOCKER = 'docker',
}

export enum BranchStrategy {
  SINGLE = 'single',
  FEATURE_MAIN = 'feature_main',
  GITFLOW = 'gitflow',
}

// ── Zod Schemas ──────────────────────────────────────────────────────

export const FrameworkSchema = z.nativeEnum(Framework);
export const PackageManagerSchema = z.nativeEnum(PackageManager);
export const DeploymentTargetSchema = z.nativeEnum(DeploymentTarget);
export const BranchStrategySchema = z.nativeEnum(BranchStrategy);

export const DetectedProjectSchema = z.object({
  framework: FrameworkSchema,
  packageManager: PackageManagerSchema,
  nodeVersion: z.string().min(1),
  hasDocker: z.boolean(),
  hasTests: z.boolean(),
  hasLinting: z.boolean(),
  testCommand: z.string().min(1).nullable(),
  buildCommand: z.string().min(1).nullable(),
  installCommand: z.string().min(1),
  detectedAt: z.string().datetime(), // Validates ISO timestamp
});

export const UserConfigSchema = z.object({
  deploymentTarget: DeploymentTargetSchema,
  branchStrategy: BranchStrategySchema,
  dockerRequired: z.boolean(),
  multiEnvironment: z.boolean(),
  environments: z.array(z.string().min(1)),
  enableTrivyScan: z.boolean().optional().default(false),
});

export const DevForgeConfigSchema = z.object({
  projectRoot: z.string().min(1).max(255), // Max 255 constraint for path strings
  detected: DetectedProjectSchema,
  user: UserConfigSchema,
  dryRun: z.boolean(),
  generatedAt: z.string().datetime(),
  devforgeVersion: z.string().min(1),
});

// ── TypeScript Interfaces ───────────────────────────────────────────

export interface DetectedProject extends z.infer<typeof DetectedProjectSchema> {}
export interface UserConfig extends z.infer<typeof UserConfigSchema> {}
export interface DevForgeConfig extends z.infer<typeof DevForgeConfigSchema> {}

// ── Validation Helper ────────────────────────────────────────────────

/**
 * Validates raw configuration data against the DevForgeConfig schema.
 * Throws a ValidationError with the first Zod error message on failure.
 */
export function validateConfig(raw: unknown): DevForgeConfig {
  const result = DevForgeConfigSchema.safeParse(raw);
  if (!result.success) {
    const firstError = result.error.errors[0];
    const message = firstError
      ? `${firstError.path.join('.')}: ${firstError.message}`
      : 'Invalid configuration';
    throw new ValidationError(message);
  }
  return result.data;
}
