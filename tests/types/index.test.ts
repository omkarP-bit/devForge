import {
  Framework,
  PackageManager,
  DeploymentTarget,
  BranchStrategy,
  validateConfig,
  DevForgeConfig,
} from '../../src/types';
import { ValidationError } from '../../src/utils/errors';

describe('configuration validation and schemas', () => {
  const validConfig: DevForgeConfig = {
    projectRoot: '/dev/my-project',
    dryRun: false,
    generatedAt: new Date().toISOString(),
    devforgeVersion: '1.0.0',
    detected: {
      framework: Framework.REACT,
      packageManager: PackageManager.NPM,
      hasDocker: false,
      hasTests: true,
      hasLinting: true,
      testCommand: 'npm run test',
      buildCommand: 'npm run build',
      installCommand: 'npm install',
      detectedAt: new Date().toISOString(),
    },
    user: {
      deploymentTarget: DeploymentTarget.VERCEL,
      branchStrategy: BranchStrategy.FEATURE_MAIN,
      dockerRequired: false,
      multiEnvironment: true,
      environments: ['dev', 'staging', 'production'],
    },
  };

  it('successfully validates a valid configuration state', () => {
    const result = validateConfig(validConfig);
    expect(result).toEqual(validConfig);
  });

  it('throws ValidationError when projectRoot is too long', () => {
    const invalidConfig = {
      ...validConfig,
      projectRoot: 'x'.repeat(256),
    };
    expect(() => validateConfig(invalidConfig)).toThrow(ValidationError);
    expect(() => validateConfig(invalidConfig)).toThrow('projectRoot: String must contain at most 255 character');
  });

  it('throws ValidationError when framework is invalid', () => {
    const invalidConfig = {
      ...validConfig,
      detected: {
        ...validConfig.detected,
        framework: 'invalid-framework',
      },
    };
    expect(() => validateConfig(invalidConfig)).toThrow(ValidationError);
  });

  it('throws ValidationError when detectedAt is not a valid ISO timestamp', () => {
    const invalidConfig = {
      ...validConfig,
      detected: {
        ...validConfig.detected,
        detectedAt: 'not-a-date',
      },
    };
    expect(() => validateConfig(invalidConfig)).toThrow(ValidationError);
  });

  it('allows null for testCommand and buildCommand', () => {
    const configWithNulls = {
      ...validConfig,
      detected: {
        ...validConfig.detected,
        testCommand: null,
        buildCommand: null,
      },
    };
    const result = validateConfig(configWithNulls);
    expect(result.detected.testCommand).toBeNull();
    expect(result.detected.buildCommand).toBeNull();
  });

  it('throws ValidationError for empty string environments', () => {
    const invalidConfig = {
      ...validConfig,
      user: {
        ...validConfig.user,
        environments: ['dev', ''],
      },
    };
    expect(() => validateConfig(invalidConfig)).toThrow(ValidationError);
  });
});
