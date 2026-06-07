import { isGraphEnabled } from '../../../src/agent/graph/GraphConfig';

describe('GraphConfig', () => {
  const originalEnv = process.env.DEVFORGE_USE_LANGGRAPH;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DEVFORGE_USE_LANGGRAPH;
    } else {
      process.env.DEVFORGE_USE_LANGGRAPH = originalEnv;
    }
  });

  it('disables the graph when --no-agent is set', () => {
    process.env.DEVFORGE_USE_LANGGRAPH = 'true';
    expect(isGraphEnabled({ noAgent: true })).toBe(false);
  });

  it('disables the graph when DEVFORGE_USE_LANGGRAPH=false', () => {
    process.env.DEVFORGE_USE_LANGGRAPH = 'false';
    expect(isGraphEnabled()).toBe(false);
  });

  it('enables the graph by default when env is unset', () => {
    delete process.env.DEVFORGE_USE_LANGGRAPH;
    expect(isGraphEnabled()).toBe(true);
  });

  it('reads max fix attempts from env', () => {
    const original = process.env.DEVFORGE_GRAPH_MAX_FIX_ATTEMPTS;
    process.env.DEVFORGE_GRAPH_MAX_FIX_ATTEMPTS = '5';
    const { getMaxFixAttempts } = require('../../../src/agent/graph/GraphConfig');
    expect(getMaxFixAttempts()).toBe(5);
    process.env.DEVFORGE_GRAPH_MAX_FIX_ATTEMPTS = original;
  });
});
