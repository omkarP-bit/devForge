type GraphNode = (state: Record<string, unknown>) => Promise<Record<string, unknown>>;

class MockStateGraph {
  private readonly nodes = new Map<string, GraphNode>();
  private startNode: string | null = null;
  private readonly linearEdges = new Map<string, string>();
  private readonly conditionalEdges = new Map<
    string,
    { router: (state: Record<string, unknown>) => string; map: Record<string, string> }
  >();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_annotation: unknown) {}

  addNode(name: string, fn: GraphNode): this {
    this.nodes.set(name, fn);
    return this;
  }

  addEdge(from: string, to: string): this {
    if (from === '__start__') {
      this.startNode = to;
      return this;
    }

    this.linearEdges.set(from, to === '__end__' ? '__end__' : to);
    return this;
  }

  addConditionalEdges(
    from: string,
    router: (state: Record<string, unknown>) => string,
    map: Record<string, string>,
  ): this {
    this.conditionalEdges.set(from, { router, map });
    return this;
  }

  compile(): { invoke: (initialState: Record<string, unknown>) => Promise<Record<string, unknown>> } {
    const graph = this;

    return {
      async invoke(initialState: Record<string, unknown>) {
        let state = { ...initialState };
        let current = graph.startNode;

        while (current && current !== '__end__') {
          const node = graph.nodes.get(current);
          if (node) {
            const update = await node(state);
            state = { ...state, ...update };
          }

          const conditional = graph.conditionalEdges.get(current);
          if (conditional) {
            const route = conditional.router(state);
            current = conditional.map[route] ?? '__end__';
            continue;
          }

          current = graph.linearEdges.get(current) ?? '__end__';
        }

        return state;
      },
    };
  }
}

function annotationRoot<T extends Record<string, unknown>>(definition: T) {
  return {
    spec: definition,
    State: {},
    Update: {},
  };
}

function annotationValue(): null {
  return null;
}

export const langgraphMock = {
  StateGraph: MockStateGraph,
  START: '__start__',
  END: '__end__',
  Annotation: Object.assign(annotationValue, {
    Root: annotationRoot,
  }),
};
