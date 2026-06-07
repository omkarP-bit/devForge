export class SanitizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SanitizationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PathTraversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathTraversalError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DetectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DetectionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GeneratorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeneratorError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AgentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentConfigError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AgentTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentTimeoutError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
