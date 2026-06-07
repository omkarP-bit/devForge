import { IaCGenerationAgent } from '../../agents/IaCGenerationAgent';
import { createAgentCache } from '../../cache/createAgentCache';
import { createDefaultProvider } from '../dependencies';
import { DevForgeGraphUpdate, DevForgeGraphStateType } from '../stateAnnotation';
import { IaCGenerationOutput } from '../../../types';
import { logger } from '../../../utils/logger';

export async function iacGenerateNode(
  state: DevForgeGraphStateType,
): Promise<DevForgeGraphUpdate> {
  const attempt = state.iacGenerationAttempt + 1;
  const max = state.iacGenerationMaxAttempts;

  logger.info(`⟳ Generating IaC configuration (attempt ${attempt}/${max})...`);

  try {
    const provider = createDefaultProvider(state.credentials);
    const cache = createAgentCache(state.credentials);
    const agent = new IaCGenerationAgent(provider, state.credentials, cache);

    const previousErrors =
      attempt > 1 && state.iacVerifyResult
        ? state.iacVerifyResult.errors.map((e) => e.message)
        : undefined;

    const result = await agent.run(state.context, previousErrors);

    if (!result.success) {
      return {
        phase: 'iac_generate',
        iacGenerationAttempt: attempt,
        errors: result.messages.map((m) => m.text),
        iacSkipped: true,
      };
    }

    const iacOutput = (result as typeof result & { iacOutput?: IaCGenerationOutput }).iacOutput;

    if (!iacOutput) {
      return {
        phase: 'iac_generate',
        iacGenerationAttempt: attempt,
        iacSkipped: true,
      };
    }

    return {
      phase: 'iac_generate',
      iacGenerationAttempt: attempt,
      iacGenerationOutput: iacOutput,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'IaC generation failed';
    logger.warn(`IaC generation error: ${message}`);
    return {
      phase: 'iac_generate',
      iacGenerationAttempt: attempt,
      errors: [message],
      iacSkipped: true,
    };
  }
}

export function routeAfterIaCGenerate(
  state: DevForgeGraphStateType,
): 'iac_verify' | '__end__' {
  if (state.iacSkipped || !state.iacGenerationOutput) {
    return '__end__';
  }
  return 'iac_verify';
}
