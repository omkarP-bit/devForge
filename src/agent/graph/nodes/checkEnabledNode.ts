import { DevForgeGraphUpdate, DevForgeGraphStateType } from '../stateAnnotation';

export function checkEnabledNode(state: DevForgeGraphStateType): DevForgeGraphUpdate {
  if (state.noAgent || state.credentials.provider === 'offline') {
    return {
      phase: 'skipped',
    };
  }

  return {
    phase: 'idle',
  };
}

export function routeAfterCheckEnabled(
  state: DevForgeGraphStateType,
): 'recommend' | '__end__' {
  if (state.phase === 'skipped') {
    return '__end__';
  }

  return 'recommend';
}
