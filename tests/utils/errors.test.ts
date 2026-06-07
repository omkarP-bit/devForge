import {
  SanitizationError,
  PathTraversalError,
  ValidationError,
  DetectionError,
  GeneratorError,
  AgentConfigError,
  AgentTimeoutError,
} from '../../src/utils';

describe('custom errors', () => {
  it('SanitizationError works correctly', () => {
    const err = new SanitizationError('sanitization failed');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SanitizationError);
    expect(err.name).toBe('SanitizationError');
    expect(err.message).toBe('sanitization failed');
  });

  it('PathTraversalError works correctly', () => {
    const err = new PathTraversalError('path traversal');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PathTraversalError);
    expect(err.name).toBe('PathTraversalError');
    expect(err.message).toBe('path traversal');
  });

  it('ValidationError works correctly', () => {
    const err = new ValidationError('validation failed');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.name).toBe('ValidationError');
    expect(err.message).toBe('validation failed');
  });

  it('DetectionError works correctly', () => {
    const err = new DetectionError('detection failed');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DetectionError);
    expect(err.name).toBe('DetectionError');
    expect(err.message).toBe('detection failed');
  });

  it('GeneratorError works correctly', () => {
    const err = new GeneratorError('generator failed');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(GeneratorError);
    expect(err.name).toBe('GeneratorError');
    expect(err.message).toBe('generator failed');
  });

  it('AgentConfigError works correctly', () => {
    const err = new AgentConfigError('unknown provider');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AgentConfigError);
    expect(err.name).toBe('AgentConfigError');
    expect(err.message).toBe('unknown provider');
  });

  it('AgentTimeoutError works correctly', () => {
    const err = new AgentTimeoutError('openai request timed out after 30000ms');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AgentTimeoutError);
    expect(err.name).toBe('AgentTimeoutError');
    expect(err.message).toBe('openai request timed out after 30000ms');
  });
});
