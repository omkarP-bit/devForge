import { logger } from '../../utils/logger';

export interface GraphNodeTiming {
  node: string;
  durationMs: number;
}

export function logGraphNodeComplete(node: string, durationMs: number, verbose = false): void {
  const message = `[graph:${node}] completed in ${durationMs}ms`;
  if (verbose) {
    logger.info(message);
  }
}

export function wrapGraphNode<TState extends Record<string, unknown>, TUpdate extends Record<string, unknown>>(
  nodeName: string,
  handler: (state: TState) => Promise<TUpdate>,
  options: { verbose?: boolean } = {},
): (state: TState) => Promise<TUpdate & { nodeTimings: GraphNodeTiming[] }> {
  return async (state: TState) => {
    const start = Date.now();
    const update = await handler(state);
    const durationMs = Date.now() - start;
    logGraphNodeComplete(nodeName, durationMs, options.verbose);

    const previousTimings = Array.isArray(state.nodeTimings)
      ? (state.nodeTimings as GraphNodeTiming[])
      : [];

    return {
      ...update,
      nodeTimings: [...previousTimings, { node: nodeName, durationMs }],
    };
  };
}
