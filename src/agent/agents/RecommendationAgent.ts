import { BaseAgent } from '../BaseAgent';
import { AgentCache } from '../cache/AgentCache';
import { StoredCredentials } from '../credentials/types';
import { AgentFallbackError } from '../errors';
import { RecommendationStore, StoredRecommendation } from '../RecommendationStore';
import { LLMProvider } from '../providers/types';
import {
  AgentContext,
  AgentOutputMessage,
  AgentResult,
  AgentWarning,
  Recommendation,
} from '../types';
import { DeploymentTarget, DevForgeConfig, Framework } from '../../types';
import { logger } from '../../utils/logger';

const SYSTEM_PROMPT = `You are DevForge's CI/CD pipeline expert. You analyze GitHub Actions
workflows, Dockerfiles, and deployment configurations and provide actionable,
specific recommendations. Always respond in JSON format only.
Response schema: { recommendations: Recommendation[], expectedOutputs: string[] }`;

const MAX_PROMPT_LENGTH = 4000;

const SEVERITY_RANK: Record<Recommendation['severity'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const VALID_TYPES: ReadonlySet<Recommendation['type']> = new Set([
  'update',
  'security',
  'optimization',
]);

const VALID_SEVERITIES: ReadonlySet<Recommendation['severity']> = new Set([
  'low',
  'medium',
  'high',
  'critical',
]);

interface ParsedResponse {
  recommendations: Recommendation[];
  expectedOutputs: string[];
}

export class RecommendationAgent extends BaseAgent {
  readonly agentName = 'RecommendationAgent';
  protected readonly systemPrompt = SYSTEM_PROMPT;

  constructor(
    provider: LLMProvider,
    storedCredentials: StoredCredentials,
    cache?: AgentCache,
    private readonly recommendationStore?: RecommendationStore,
  ) {
    super(provider, SYSTEM_PROMPT, storedCredentials, cache);
  }

  async run(context: AgentContext): Promise<AgentResult> {
    const previousUnresolved = this.recommendationStore
      ? (await this.recommendationStore.load()).filter(
          (recommendation) => recommendation.status === 'new',
        )
      : [];

    const prompt = this.buildPrompt(context, previousUnresolved);

    let responseText: string;
    try {
      responseText = await this.chat(prompt, context);
    } catch (error) {
      if (error instanceof AgentFallbackError) {
        const result = error.result;
        await this.persistRecommendations(result.recommendations);
        return result;
      }
      throw error;
    }

    const parsed = this.parseResponse(responseText);
    const result = this.toAgentResult(parsed, context);
    await this.persistRecommendations(result.recommendations);
    return result;
  }

  private async persistRecommendations(recommendations: Recommendation[]): Promise<void> {
    if (!this.recommendationStore) {
      return;
    }

    await this.recommendationStore.save(recommendations);
  }

  protected fallback(context: AgentContext): AgentResult {
    const outputs = buildExpectedOutputsFromConfig(context.config);
    const messages: AgentOutputMessage[] = outputs.map((text) => ({ type: 'info', text }));
    messages.unshift({
      type: 'info',
      text: 'AI recommendations are unavailable in this mode. Showing static expected outputs.',
    });

    return {
      agentName: this.agentName,
      success: true,
      messages,
      expectedOutputs: outputs,
      recommendations: [
        {
          type: 'optimization',
          severity: 'low',
          title: 'AI recommendations unavailable',
          description: 'Run in online mode for personalized pipeline recommendations.',
          autoFixAvailable: false,
        },
      ],
      warnings: [],
    };
  }

  private buildPrompt(
    context: AgentContext,
    previousUnresolved: StoredRecommendation[] = [],
  ): string {
    const sections: string[] = [];

    const diffSection = this.buildDiffSection(context);
    if (diffSection) {
      sections.push(diffSection);
    }

    sections.push(this.buildProjectSection(context));

    const failureSection = this.buildFailureSection(context);
    if (failureSection) {
      sections.push(failureSection);
    }

    const historySection = this.buildHistorySection(previousUnresolved);
    if (historySection) {
      sections.push(historySection);
    }

    sections.push(this.buildTaskSection());

    let prompt = sections.join('\n\n');
    prompt = this.truncatePrompt(prompt, sections);

    return prompt;
  }

  private buildDiffSection(context: AgentContext): string | null {
    if (!context.lastRunJson) {
      return null;
    }
    const summary = this.summarizeLastRun(context.lastRunJson);
    if (!summary) {
      return null;
    }
    return `## What Changed (since last run)\n${summary}`;
  }

  private buildProjectSection(context: AgentContext): string {
    const config = context.config;
    const fileList =
      context.generatedFiles.length > 0
        ? context.generatedFiles.map((file) => `- ${file}`).join('\n')
        : '(no files generated)';

    return [
      '## Project Context',
      `Framework: ${config.detected.framework}`,
      `Package manager: ${config.detected.packageManager}`,
      `Node version: ${config.detected.nodeVersion}`,
      `Test command: ${config.detected.testCommand ?? '(none)'}`,
      `Build command: ${config.detected.buildCommand ?? '(none)'}`,
      `Install command: ${config.detected.installCommand}`,
      `Deployment target: ${config.user.deploymentTarget}`,
      `Branch strategy: ${config.user.branchStrategy}`,
      `Docker required: ${config.user.dockerRequired}`,
      '',
      '## Generated Files',
      fileList,
    ].join('\n');
  }

  private buildHistorySection(previousUnresolved: StoredRecommendation[]): string | null {
    if (previousUnresolved.length === 0) {
      return null;
    }

    const lines = previousUnresolved.map(
      (recommendation) =>
        `- [${recommendation.severity}] ${recommendation.title}: ${recommendation.description}`,
    );

    return ['## Previously Flagged', 'Previously flagged and not yet resolved:', ...lines].join(
      '\n',
    );
  }

  private buildFailureSection(context: AgentContext): string | null {
    const errorSignals = context.failureSignals.filter((signal) => signal.severity === 'error');
    if (errorSignals.length === 0) {
      return null;
    }

    const lines = errorSignals.map(
      (signal) => `- [${signal.type}] ${signal.message} (${signal.affectedFile})`,
    );

    return [
      '## Pipeline Failure',
      'The following pipeline failures were detected:',
      ...lines,
      '',
      'Focus on fixing these issues first before optimizing.',
    ].join('\n');
  }

  private buildTaskSection(): string {
    return [
      '## Task',
      'Analyze this CI/CD pipeline configuration and respond with JSON only.',
      'Response shape:',
      '{ "recommendations": [Recommendation, ...], "expectedOutputs": string[] }',
      'Recommendation: { type: "update"|"security"|"optimization", severity: "low"|"medium"|"high"|"critical", title: string, description: string, autoFixAvailable: boolean }',
      'expectedOutputs: a numbered plain-English list of what this pipeline will do once it runs.',
    ].join('\n');
  }

  private summarizeLastRun(lastRun: NonNullable<AgentContext['lastRunJson']>): string {
    const parts: string[] = [];
    parts.push(`Last run timestamp: ${lastRun.timestamp}`);
    parts.push(`Plan hash: ${lastRun.planHash}`);

    const { generationResult } = lastRun;
    if (generationResult.written.length > 0) {
      parts.push(`Files written previously: ${generationResult.written.join(', ')}`);
    }
    if (generationResult.skipped.length > 0) {
      parts.push(`Files skipped previously: ${generationResult.skipped.join(', ')}`);
    }
    if (generationResult.backed_up.length > 0) {
      parts.push(`Files backed up previously: ${generationResult.backed_up.join(', ')}`);
    }
    if (generationResult.errors.length > 0) {
      const errorSummary = generationResult.errors
        .map((entry) => `${entry.path}: ${entry.error}`)
        .join('; ');
      parts.push(`Previous errors: ${errorSummary}`);
    }
    return parts.join('\n');
  }

  private truncatePrompt(prompt: string, sections: string[]): string {
    if (prompt.length <= MAX_PROMPT_LENGTH) {
      return prompt;
    }

    const working = [...sections];
    let result = prompt;
    while (result.length > MAX_PROMPT_LENGTH && working.length > 1) {
      working.shift();
      result = working.join('\n\n');
    }

    if (result.length > MAX_PROMPT_LENGTH) {
      result = result.slice(0, MAX_PROMPT_LENGTH);
    }

    return result;
  }

  private parseResponse(response: string): ParsedResponse {
    const empty: ParsedResponse = { recommendations: [], expectedOutputs: [] };
    const json = this.extractJson(response);
    if (json === null) {
      logger.warn('RecommendationAgent: could not extract JSON from provider response');
      return empty;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      logger.warn(`RecommendationAgent: failed to parse JSON: ${message}`);
      return empty;
    }

    if (!parsed || typeof parsed !== 'object') {
      return empty;
    }

    const obj = parsed as Record<string, unknown>;
    return {
      recommendations: this.parseRecommendations(obj['recommendations']),
      expectedOutputs: this.parseExpectedOutputs(obj['expectedOutputs']),
    };
  }

  private parseRecommendations(value: unknown): Recommendation[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const result: Recommendation[] = [];
    for (const item of value) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const obj = item as Record<string, unknown>;
      const type = obj['type'];
      const severity = obj['severity'];
      const title = obj['title'];
      const description = obj['description'];
      const autoFixAvailable = obj['autoFixAvailable'];

      if (typeof type !== 'string' || !VALID_TYPES.has(type as Recommendation['type'])) {
        continue;
      }
      if (
        typeof severity !== 'string' ||
        !VALID_SEVERITIES.has(severity as Recommendation['severity'])
      ) {
        continue;
      }
      if (typeof title !== 'string' || title.trim().length === 0) {
        continue;
      }
      if (typeof description !== 'string') {
        continue;
      }

      result.push({
        type: type as Recommendation['type'],
        severity: severity as Recommendation['severity'],
        title: title.trim(),
        description: description.trim(),
        autoFixAvailable: Boolean(autoFixAvailable),
      });
    }
    return result;
  }

  private parseExpectedOutputs(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    const result: string[] = [];
    for (const item of value) {
      if (typeof item === 'string' && item.trim().length > 0) {
        result.push(item.trim());
      }
    }
    return result;
  }

  private extractJson(response: string): string | null {
    const trimmed = response.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      return fenced[1].trim();
    }

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed;
    }

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }

    return null;
  }

  private toAgentResult(parsed: ParsedResponse, context: AgentContext): AgentResult {
    const sorted = [...parsed.recommendations].sort(
      (left, right) => SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity],
    );

    const messages: AgentOutputMessage[] = parsed.expectedOutputs.map((text) => ({
      type: 'info',
      text,
    }));

    if (messages.length === 0) {
      for (const text of buildExpectedOutputsFromConfig(context.config)) {
        messages.push({ type: 'info', text });
      }
    }

    const warnings: AgentWarning[] = sorted
      .filter((rec) => rec.severity === 'high' || rec.severity === 'critical')
      .map((rec) => ({
        severity: rec.severity,
        title: rec.title,
        description: rec.description,
      }));

    const expectedOutputs = messages.map((message) => message.text);

    return {
      agentName: this.agentName,
      success: true,
      messages,
      expectedOutputs,
      recommendations: sorted,
      warnings,
    };
  }
}

export function buildExpectedOutputsFromConfig(config: DevForgeConfig): string[] {
  const outputs: string[] = [];

  const install = config.detected.installCommand || 'npm ci';
  outputs.push(`Install dependencies via ${install}`);

  if (config.detected.testCommand) {
    outputs.push(`Run tests via ${config.detected.testCommand}`);
  }

  const frameworkOutputs = describeFramework(config.detected.framework);
  outputs.push(...frameworkOutputs);

  if (config.detected.buildCommand) {
    outputs.push(`Build the project via ${config.detected.buildCommand}`);
  }

  const deployOutputs = describeDeploymentTarget(config.user.deploymentTarget);
  outputs.push(...deployOutputs);

  return outputs;
}

function describeFramework(framework: Framework): string[] {
  switch (framework) {
    case Framework.NEXTJS:
      return [
        'Run `next build` to produce the optimized production bundle',
        'Cache Next.js build output between runs',
      ];
    case Framework.REACT:
      return ['Build the React client bundle with the configured bundler'];
    case Framework.EXPRESS:
      return ['Start the Express server in production mode'];
    case Framework.NESTJS:
      return ['Compile the NestJS application and start `node dist/main`'];
    case Framework.VUE:
      return ['Build the Vue.js production bundle'];
    case Framework.ANGULAR:
      return ['Build the Angular application with `ng build`'];
    case Framework.MERN:
      return ['Build the MERN client and server artifacts'];
    case Framework.UNKNOWN:
    default:
      return ['Run the detected build command'];
  }
}

function describeDeploymentTarget(target: DeploymentTarget): string[] {
  switch (target) {
    case DeploymentTarget.VERCEL:
      return [
        'Provision preview deployments for pull requests',
        'Deploy the production build via `vercel --prod`',
      ];
    case DeploymentTarget.RAILWAY:
      return ['Deploy the service to Railway via `railway up`'];
    case DeploymentTarget.RENDER:
      return ['Apply the Render blueprint and trigger a deploy'];
    case DeploymentTarget.FIREBASE:
      return ['Deploy hosting assets and functions via `firebase deploy`'];
    case DeploymentTarget.AWS_EC2:
      return [
        'Authenticate to Amazon ECR and push the Docker image',
        'Deploy the new image to the target EC2 instance over SSH',
      ];
    case DeploymentTarget.DOCKER:
      return ['Build the Docker image and push it to the configured registry'];
    default:
      return ['Deploy to the configured target'];
  }
}
