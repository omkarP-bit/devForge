export interface GraphEnableOptions {
  noAgent?: boolean;
}

const DEFAULT_MAX_FIX_ATTEMPTS = 3;

/**
 * Returns whether LangGraph orchestration is active for agent pipelines.
 * Disabled when --no-agent is set or DEVFORGE_USE_LANGGRAPH=false.
 */
export function isGraphEnabled(options: GraphEnableOptions = {}): boolean {
  if (options.noAgent) {
    return false;
  }

  const env = process.env.DEVFORGE_USE_LANGGRAPH?.trim().toLowerCase();
  if (env === 'false' || env === '0' || env === 'no') {
    return false;
  }

  return true;
}

export function getMaxFixAttempts(): number {
  const raw = process.env.DEVFORGE_GRAPH_MAX_FIX_ATTEMPTS?.trim();
  if (!raw) {
    return DEFAULT_MAX_FIX_ATTEMPTS;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_MAX_FIX_ATTEMPTS;
  }

  return parsed;
}
