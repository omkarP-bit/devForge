import ora, { Ora } from 'ora';
import { BaseAgent } from './BaseAgent';
import { AgentContext, AgentOutputMessage, AgentResult } from './types';
import { logger } from '../utils/logger';

/**
 * Legacy sequential agent runner used when `DEVFORGE_USE_LANGGRAPH=false`.
 * Prefer LangGraph orchestration via `runDevForgeGraph()` for init and audit flows.
 *
 * @deprecated Use the graph layer in `src/agent/graph/` when LangGraph is enabled.
 */
export class AgentRuntime {
  async runForeground(agent: BaseAgent, context: AgentContext): Promise<AgentResult> {
    const spinner = ora(`Running ${agent.agentName}...`).start();

    try {
      const result = await agent.run(context);
      this.finishSpinner(spinner, agent.agentName, result.success);
      this.printResult(result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      spinner.fail(`${agent.agentName} failed`);
      logger.warn(`Agent ${agent.agentName} failed: ${message}`);

      const failureResult = this.createFailureResult(agent.agentName, message);
      this.printResult(failureResult);
      return failureResult;
    }
  }

  runBackground(agent: BaseAgent, context: AgentContext): void {
    setImmediate(async () => {
      try {
        const result = await agent.run(context);
        this.printResult(result);
      } catch (e) {
        const name = agent.agentName;
        logger.warn(`[agent] ${name} encountered an error and was skipped`);
      }
    });
  }

  async runAll(
    agents: BaseAgent[],
    context: AgentContext,
    mode: 'foreground' | 'background',
  ): Promise<AgentResult[]> {
    if (mode === 'background') {
      for (const agent of agents) {
        this.runBackground(agent, context);
      }
      return [];
    }

    const results: AgentResult[] = [];

    for (const agent of agents) {
      results.push(await this.runForeground(agent, context));
    }

    return results;
  }

  private finishSpinner(spinner: Ora, agentName: string, success: boolean): void {
    if (success) {
      spinner.succeed(`${agentName} completed`);
      return;
    }

    spinner.warn(`${agentName} finished with warnings`);
  }

  private createFailureResult(agentName: string, message: string): AgentResult {
    return {
      agentName,
      success: false,
      messages: [
        {
          type: 'warn',
          text: `${agentName} could not complete: ${message}`,
        },
      ],
      expectedOutputs: [],
      recommendations: [],
      warnings: [],
    };
  }

  private printResult(result: AgentResult): void {
    for (const message of result.messages) {
      if (message.type === 'info') {
        continue;
      }
      this.printMessage(message);
    }

    for (const warning of result.warnings) {
      logger.warn(`[${warning.severity}] ${warning.title}: ${warning.description}`);
    }
  }

  private printMessage(message: AgentOutputMessage): void {
    switch (message.type) {
      case 'success':
        logger.success(message.text);
        break;
      case 'warn':
        logger.warn(message.text);
        break;
      case 'error':
        logger.error(message.text);
        break;
      default:
        logger.info(message.text);
    }
  }
}
