import { z } from 'zod';
import { BaseAgent } from '../BaseAgent';
import { AgentCache } from '../cache/AgentCache';
import { StoredCredentials } from '../credentials/types';
import { AgentFallbackError } from '../errors';
import { LLMProvider } from '../providers/types';
import { AgentContext, AgentResult } from '../types';
import {
  DeploymentTarget,
  Framework,
  IaCGenerationOutput,
  IaCGeneratedFile,
} from '../../types';
import {
  getIaCBlocks,
  getInstallInstructions,
  buildSubstitutionVars,
  supportsIaCGeneration,
  IaCToolChoice,
} from '../../templates/iac-blocks/registry';
import { logger } from '../../utils/logger';

const SYSTEM_PROMPT = `You are a DevOps infrastructure expert. You generate Infrastructure-as-Code
configurations for cloud deployments. You ONLY output the specific file contents requested,
in JSON format. You never generate shell scripts inline. You always follow the exact schema
provided. Respond only with valid JSON matching the IaCGenerationOutput schema.`;

const MAX_PROMPT_LENGTH = 3000;

const IaCGeneratedFileSchema = z.object({
  relativePath: z.string().min(1),
  content: z.string().min(1),
  description: z.string(),
});

const IaCGenerationOutputSchema = z.object({
  tool: z.enum(['terraform', 'cdk', 'boto3']),
  files: z.array(IaCGeneratedFileSchema).min(1),
  installInstructions: z.array(z.string()),
  notes: z.array(z.string()),
});

export class IaCGenerationAgent extends BaseAgent {
  readonly agentName = 'IaCGenerationAgent';

  constructor(
    provider: LLMProvider,
    storedCredentials: StoredCredentials,
    cache?: AgentCache,
  ) {
    super(provider, SYSTEM_PROMPT, storedCredentials, cache ?? new AgentCache());
  }

  async run(context: AgentContext, previousErrors?: string[]): Promise<AgentResult> {
    const tool = this.selectTool(context);
    const target = context.config.user.deploymentTarget;

    if (!supportsIaCGeneration(target)) {
      return {
        agentName: this.agentName,
        success: true,
        messages: [
          {
            type: 'info',
            text: `Deployment target ${target} is a managed platform — IaC generation not required.`,
          },
        ],
        expectedOutputs: [],
        recommendations: [],
        warnings: [],
      };
    }

    const projectName =
      context.config.projectRoot.split('/').pop() ??
      context.config.projectRoot.split('\\').pop() ??
      'app';

    const vars = buildSubstitutionVars(projectName);
    const templateBlocks = getIaCBlocks(target, tool, vars);

    const prompt = this.buildPrompt(context, tool, templateBlocks, previousErrors);

    let responseText: string;
    try {
      responseText = await this.chat(prompt, context);
    } catch (error) {
      if (error instanceof AgentFallbackError) {
        return error.result;
      }
      throw error;
    }

    const output = this.parseResponse(responseText, tool, templateBlocks);

    return {
      agentName: this.agentName,
      success: true,
      messages: output.files.map((file) => ({
        type: 'info' as const,
        text: `Generated ${file.relativePath}: ${file.description}`,
      })),
      expectedOutputs: output.files.map((f) => f.relativePath),
      recommendations: [],
      warnings: [],
      iacOutput: output,
    } as AgentResult & { iacOutput: IaCGenerationOutput };
  }

  protected fallback(_context: AgentContext): AgentResult {
    return {
      agentName: this.agentName,
      success: false,
      messages: [
        {
          type: 'error',
          text: 'IaC generation requires an online LLM provider. Run in online mode.',
        },
      ],
      expectedOutputs: [],
      recommendations: [],
      warnings: [],
    };
  }

  private selectTool(context: AgentContext): IaCToolChoice {
    const userTool = context.config.user.iacTool;
    if (userTool && userTool !== 'skip') {
      return userTool as IaCToolChoice;
    }

    const target = context.config.user.deploymentTarget;
    if (target === DeploymentTarget.AWS_EKS || target === DeploymentTarget.AWS_ECS) {
      return 'terraform';
    }

    const framework = context.config.detected.framework;
    if (
      framework === Framework.EXPRESS ||
      framework === Framework.NESTJS ||
      framework === Framework.NEXTJS
    ) {
      return 'cdk';
    }

    return 'terraform';
  }

  private buildPrompt(
    context: AgentContext,
    tool: IaCToolChoice,
    templateBlocks: { relativePath: string; content: string; description: string }[],
    previousErrors?: string[],
  ): string {
    const parts: string[] = [];

    if (previousErrors && previousErrors.length > 0) {
      parts.push(
        `Previous generation failed verification with these errors:\n${previousErrors.map((e) => `- ${e}`).join('\n')}\nFix them in the new generation.`,
      );
    }

    parts.push(
      [
        `Generate ${tool} IaC configuration for:`,
        `Framework: ${context.config.detected.framework}`,
        `Deployment target: ${context.config.user.deploymentTarget}`,
        `Package manager: ${context.config.detected.packageManager}`,
        '',
        'The following template files have been pre-rendered with project variables.',
        'Return them as-is in the JSON response, only correcting any syntax issues:',
        '',
        ...templateBlocks.map((b) => `File: ${b.relativePath}\nDescription: ${b.description}`),
      ].join('\n'),
    );

    parts.push(
      [
        'Respond with valid JSON only:',
        '{ "tool": "<tool>", "files": [{ "relativePath": "<path>", "content": "<content>", "description": "<desc>" }], "installInstructions": [], "notes": [] }',
      ].join('\n'),
    );

    return parts.join('\n\n').slice(0, MAX_PROMPT_LENGTH);
  }

  private parseResponse(
    responseText: string,
    tool: IaCToolChoice,
    fallbackBlocks: IaCGeneratedFile[],
  ): IaCGenerationOutput {
    const json = this.extractJson(responseText);
    if (json) {
      try {
        const parsed = JSON.parse(json);
        const validated = IaCGenerationOutputSchema.safeParse(parsed);
        if (validated.success) {
          return validated.data;
        }
        logger.warn(
          `IaCGenerationAgent: LLM response failed schema validation, retrying with templates`,
        );
      } catch {
        logger.warn(`IaCGenerationAgent: failed to parse LLM JSON response, using templates`);
      }
    }

    return {
      tool,
      files: fallbackBlocks,
      installInstructions: getInstallInstructions(tool),
      notes: ['Generated from verified templates — review before applying.'],
    };
  }

  private extractJson(text: string): string | null {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return fenced[1].trim();
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last > first) return text.slice(first, last + 1);
    return null;
  }
}
