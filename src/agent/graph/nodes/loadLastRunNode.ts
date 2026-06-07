import { LastRunMetadata } from '../../../generator';
import { DevForgeGraphUpdate, DevForgeGraphStateType } from '../stateAnnotation';
import { DevForgeFS } from '../../../utils/fs';

export interface LoadLastRunNodeContext {
  fs: DevForgeFS;
}

export function createLoadLastRunNode(context: LoadLastRunNodeContext) {
  return async function loadLastRunNode(state: DevForgeGraphStateType): Promise<DevForgeGraphUpdate> {
    let lastRunJson: LastRunMetadata | null = null;

    try {
      const raw = await context.fs.readFile('.devforge/last-run.json');
      lastRunJson = JSON.parse(raw) as LastRunMetadata;
    } catch {
      lastRunJson = null;
    }

    return {
      context: {
        ...state.context,
        lastRunJson,
      },
      phase: 'diagnose',
    };
  };
}
