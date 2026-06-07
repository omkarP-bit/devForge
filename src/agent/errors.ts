import { AgentResult } from './types';

export class AgentFallbackError extends Error {
  readonly result: AgentResult;

  constructor(result: AgentResult) {
    super('Agent fallback invoked');
    this.name = 'AgentFallbackError';
    this.result = result;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
