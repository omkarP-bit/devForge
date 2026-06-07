import { ExpectedOutputReporter } from '../../reporters';
import { AgentResult } from '../../types';
import { DevForgeGraphUpdate, DevForgeGraphStateType } from '../stateAnnotation';

function createEmptyAgentResult(): AgentResult {
  return {
    agentName: 'RecommendationAgent',
    success: true,
    messages: [],
    expectedOutputs: [],
    recommendations: [],
    warnings: [],
  };
}

export async function reportExpectedOutputsNode(
  state: DevForgeGraphStateType,
): Promise<DevForgeGraphUpdate> {
  if (state.skipReport) {
    return { phase: 'diagnose' };
  }

  const reporter = new ExpectedOutputReporter();
  await reporter.report(state.recommendationResult ?? createEmptyAgentResult(), state.context.config);

  return { phase: 'diagnose' };
}
