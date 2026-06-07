import {
  ExpectedOutputReporter,
  renderExpectedOutputReport,
  resolveExpectedOutputs,
} from '../../../src/agent/reporters/ExpectedOutputReporter';
import { AgentResult } from '../../../src/agent/types';
import {
  BranchStrategy,
  DeploymentTarget,
  DevForgeConfig,
  Framework,
  PackageManager,
} from '../../../src/types';

function createConfig(overrides?: Partial<DevForgeConfig>): DevForgeConfig {
  return {
    projectRoot: '/tmp/project',
    detected: {
      framework: Framework.NEXTJS,
      packageManager: PackageManager.NPM,
      nodeVersion: '20',
      hasDocker: false,
      hasTests: true,
      hasLinting: true,
      testCommand: 'npm test',
      buildCommand: 'npm run build',
      installCommand: 'npm ci',
      detectedAt: new Date().toISOString(),
    },
    user: {
      deploymentTarget: DeploymentTarget.VERCEL,
      branchStrategy: BranchStrategy.FEATURE_MAIN,
      dockerRequired: false,
      multiEnvironment: false,
      environments: [],
    },
    dryRun: false,
    generatedAt: new Date().toISOString(),
    devforgeVersion: '2.0.0',
    ...overrides,
  };
}

function createResult(overrides?: Partial<AgentResult>): AgentResult {
  return {
    agentName: 'RecommendationAgent',
    success: true,
    messages: [],
    expectedOutputs: [],
    recommendations: [],
    warnings: [],
    ...overrides,
  };
}

describe('ExpectedOutputReporter', () => {
  describe('resolveExpectedOutputs()', () => {
    it('uses result.expectedOutputs when present', () => {
      const outputs = resolveExpectedOutputs(
        createResult({
          expectedOutputs: ['Install dependencies via npm ci', 'Deploy to Vercel'],
        }),
        createConfig(),
      );

      expect(outputs).toEqual(['Install dependencies via npm ci', 'Deploy to Vercel']);
    });

    it('falls back to buildExpectedOutputsFromConfig() when expectedOutputs is empty', () => {
      const outputs = resolveExpectedOutputs(createResult(), createConfig());

      expect(outputs.length).toBeGreaterThan(0);
      expect(outputs.some((output) => output.includes('npm ci'))).toBe(true);
      expect(outputs.some((output) => /vercel/i.test(output))).toBe(true);
    });
  });

  describe('renderExpectedOutputReport()', () => {
    it('renders a bordered numbered list from agent expected outputs', () => {
      const rendered = renderExpectedOutputReport(
        createResult({
          expectedOutputs: [
            'Install dependencies via npm ci',
            'Run tests via npm test',
            'Deploy to Vercel (production branch)',
          ],
        }),
        createConfig(),
      );

      expect(rendered).toMatchSnapshot();
    });

    it('renders static fallback outputs when the agent returned none', () => {
      const rendered = renderExpectedOutputReport(createResult(), createConfig());

      expect(rendered).toMatchSnapshot();
    });

    it('appends critical recommendations after the table', () => {
      const rendered = renderExpectedOutputReport(
        createResult({
          expectedOutputs: ['Install dependencies via npm ci'],
          recommendations: [
            {
              type: 'security',
              severity: 'critical',
              title: 'Pin actions',
              description: 'Pin GitHub Actions by commit SHA',
              autoFixAvailable: true,
            },
            {
              type: 'optimization',
              severity: 'low',
              title: 'Cache deps',
              description: 'Enable dependency caching',
              autoFixAvailable: true,
            },
          ],
        }),
        createConfig(),
      );

      expect(rendered).toContain('⚠ Critical: Pin actions — Pin GitHub Actions by commit SHA');
      expect(rendered).not.toContain('Cache deps');
      expect(rendered).toMatchSnapshot();
    });
  });

  describe('report()', () => {
    it('prints the rendered report to stdout', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      const reporter = new ExpectedOutputReporter();

      await reporter.report(
        createResult({
          expectedOutputs: ['Install dependencies via npm ci'],
        }),
        createConfig(),
      );

      const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(output).toContain('What your pipeline will do');
      expect(output).toContain('1. Install dependencies via npm ci');

      logSpy.mockRestore();
    });
  });
});
