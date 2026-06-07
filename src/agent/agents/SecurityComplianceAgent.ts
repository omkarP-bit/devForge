import { BaseAgent } from '../BaseAgent';
import { AgentCache } from '../cache/AgentCache';
import { StoredCredentials } from '../credentials/types';
import { AgentFallbackError } from '../errors';
import { LLMProvider } from '../providers/types';
import { AgentContext, AgentResult, AgentWarning, Recommendation } from '../types';
import { isOfflineMode } from '../OfflineFallback';
import { ComplianceViolation, runStaticScan } from '../security/StaticSecurityScanner';
import { logger } from '../../utils/logger';

export type { ComplianceViolation };

const SYSTEM_PROMPT = `You are a DevSecOps expert specializing in GitHub Actions security.
You analyze CI/CD workflows against NIST SP 800-53 and ISO 27001 Annex A controls.
Respond only in JSON: { violations: ComplianceViolation[], riskScore: number (0-100) }`;

const MAX_YAML_CHARS = 3000;

const SEVERITY_RANK: Record<ComplianceViolation['severity'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

interface LLMScanResponse {
  violations: ComplianceViolation[];
  riskScore: number;
}

export class SecurityComplianceAgent extends BaseAgent {
  readonly agentName = 'SecurityComplianceAgent';

  constructor(
    provider: LLMProvider,
    storedCredentials: StoredCredentials,
    cache?: AgentCache,
    private readonly readFile?: (path: string) => Promise<string>,
  ) {
    super(provider, SYSTEM_PROMPT, storedCredentials, cache ?? new AgentCache());
  }

  async run(context: AgentContext): Promise<AgentResult> {
    const fileContents = await this.loadFiles(context.generatedFiles);
    const staticViolations = runStaticScan(fileContents);

    if (isOfflineMode(this.storedCredentials)) {
      return this.toAgentResult(staticViolations);
    }

    let llmViolations: ComplianceViolation[] = [];
    try {
      const yaml = Object.values(fileContents).join('\n---\n').slice(0, MAX_YAML_CHARS);
      const prompt = this.buildPrompt(yaml, staticViolations);
      const responseText = await this.chat(prompt, context);
      llmViolations = this.parseLLMResponse(responseText);
    } catch (error) {
      if (error instanceof AgentFallbackError) {
        return this.toAgentResult(staticViolations);
      }
      logger.warn(`SecurityComplianceAgent: LLM scan failed, using static results only.`);
    }

    const merged = this.mergeViolations(staticViolations, llmViolations);
    return this.toAgentResult(merged);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected fallback(_context: AgentContext): AgentResult {
    return this.toAgentResult([]);
  }

  private async loadFiles(paths: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    if (!this.readFile) return result;
    for (const p of paths) {
      try {
        // eslint-disable-next-line security/detect-object-injection
        result[p] = await this.readFile(p);
      } catch {
        // skip unreadable files
      }
    }
    return result;
  }

  private buildPrompt(yaml: string, staticViolations: ComplianceViolation[]): string {
    const alreadyFound = staticViolations.map((v) => v.controlId).join(', ') || 'none';
    return [
      'Analyze the following GitHub Actions workflow YAML for security and compliance violations.',
      `Static scanner already found: ${alreadyFound}. Report only ADDITIONAL violations not already listed.`,
      'Respond only in JSON: { "violations": [...], "riskScore": <0-100> }',
      '',
      '```yaml',
      yaml,
      '```',
    ].join('\n');
  }

  private parseLLMResponse(raw: string): ComplianceViolation[] {
    const json = this.extractJson(raw);
    if (!json) return [];
    try {
      const parsed = JSON.parse(json) as Partial<LLMScanResponse>;
      return Array.isArray(parsed.violations) ? parsed.violations : [];
    } catch {
      logger.warn('SecurityComplianceAgent: failed to parse LLM JSON response');
      return [];
    }
  }

  private extractJson(text: string): string | null {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return fenced[1].trim();
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last > first) return text.slice(first, last + 1);
    return null;
  }

  private mergeViolations(
    base: ComplianceViolation[],
    extra: ComplianceViolation[],
  ): ComplianceViolation[] {
    const seen = new Set(base.map((v) => `${v.controlId}::${v.affectedFile}`));
    const unique = extra.filter((v) => !seen.has(`${v.controlId}::${v.affectedFile}`));
    return [...base, ...unique].sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    );
  }

  private toAgentResult(violations: ComplianceViolation[]): AgentResult {
    const recommendations: Recommendation[] = violations.map((v) => ({
      type: 'security' as const,
      severity: v.severity,
      title: `[${v.controlId}] ${v.title}`,
      description: `${v.description} — ${v.remediation}`,
      autoFixAvailable: false,
    }));

    const warnings: AgentWarning[] = violations
      .filter((v) => v.severity === 'critical' || v.severity === 'high')
      .map((v) => ({
        severity: v.severity,
        title: v.title,
        description: v.description,
      }));

    return {
      agentName: this.agentName,
      success: true,
      messages: violations.length
        ? [{ type: 'warn', text: `${violations.length} compliance violation(s) found.` }]
        : [{ type: 'info', text: 'No compliance violations detected.' }],
      expectedOutputs: [],
      recommendations,
      warnings,
    };
  }
}
