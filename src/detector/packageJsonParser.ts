/* eslint-disable security/detect-object-injection */
import { z } from 'zod';
import { DevForgeFS } from '../utils/fs';
import { DetectionError } from '../utils/errors';

export interface ParsedPackageJson {
  name: string;
  version: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  hasField: (field: string) => boolean;
  getDependencyVersion: (name: string) => string | null;
  hasScript: (name: string) => boolean;
}

const PackageJsonSchema = z.object({
  name: z.string().optional().default(''),
  version: z.string().optional().default(''),
  dependencies: z.record(z.string()).optional().default({}),
  devDependencies: z.record(z.string()).optional().default({}),
  scripts: z.record(z.string()).optional().default({}),
});

/**
 * Parses package.json securely using the DevForgeFS abstraction.
 * Enforces size limits and schema validation.
 */
export async function parsePackageJson(fs: DevForgeFS): Promise<ParsedPackageJson> {
  let content: string;
  try {
    // Read with a maximum size limit of 512KB (524288 bytes)
    content = await fs.readFile('package.json', 524288);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new DetectionError(`Failed to read package.json: ${message}`);
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(content);
  } catch {
    throw new DetectionError('Invalid package.json: not valid JSON');
  }

  const result = PackageJsonSchema.safeParse(parsedRaw);
  if (!result.success) {
    const firstError = result.error.errors[0]!;
    const errorMsg = `${firstError.path.join('.')}: ${firstError.message}`;
    throw new DetectionError(`Invalid package.json schema: ${errorMsg}`);
  }

  const data = result.data;

  return {
    name: data.name,
    version: data.version,
    dependencies: data.dependencies,
    devDependencies: data.devDependencies,
    scripts: data.scripts,
    hasField(field: string): boolean {
      return (
        Object.prototype.hasOwnProperty.call(data.dependencies, field) ||
        Object.prototype.hasOwnProperty.call(data.devDependencies, field)
      );
    },
    getDependencyVersion(name: string): string | null {
      if (Object.prototype.hasOwnProperty.call(data.dependencies, name)) {
        return data.dependencies[name]!;
      }
      if (Object.prototype.hasOwnProperty.call(data.devDependencies, name)) {
        return data.devDependencies[name]!;
      }
      return null;
    },
    hasScript(name: string): boolean {
      return Object.prototype.hasOwnProperty.call(data.scripts, name);
    },
  };
}
