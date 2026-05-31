import { runGenerator } from '../../src/generator';
import { DevForgeFS } from '../../src/utils/fs';
import { GenerationPlan } from '../../src/engine/ruleEngine';
import { Framework, DeploymentTarget } from '../../src/types';
import * as templateModule from '../../src/templates';
import * as rendererModule from '../../src/engine/templateRenderer';

jest.mock('../../src/templates');
jest.mock('../../src/engine/templateRenderer');

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Generator Validation and Multi-Env', () => {
  let mockFs: jest.Mocked<DevForgeFS>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFs = {
      fileExists: jest.fn().mockResolvedValue(false),
      readFile: jest.fn().mockResolvedValue(''),
      writeFile: jest.fn().mockResolvedValue(undefined),
      ensureDir: jest.fn().mockResolvedValue(undefined),
      projectRoot: '/',
      dryRun: false,
    } as any;
    (templateModule.getTemplate as jest.Mock).mockReturnValue('template');
  });

  it('blocks writing invalid workflow YAML and records an error', async () => {
    // renderer returns content that does NOT look like a workflow (so validator skips),
    // then returns invalid YAML for workflow to trigger validation error
    (rendererModule.renderTemplate as jest.Mock)
      .mockReturnValueOnce('name: CI\njobs: { broken')
      .mockReturnValue('rendered content');

    const plan: GenerationPlan = {
      files: [
        { path: '.github/workflows/ci.yml', templateId: 'base-ci', variables: [] },
      ],
      planHash: 't1',
      framework: Framework.REACT,
      deploymentTarget: DeploymentTarget.VERCEL,
      generatedAt: new Date().toISOString(),
      devforgeVersion: '1.0.0',
    };

    // Force the renderer to produce invalid YAML
    (rendererModule.renderTemplate as jest.Mock).mockReturnValue('on: [push]\njobs: {bad');

    const result = await runGenerator(plan, mockFs);

    expect(result.written).not.toContain('.github/workflows/ci.yml');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(mockFs.writeFile).toHaveBeenCalled(); // last-run.json still written
  });

  it('writes multiple environment workflows when present', async () => {
    (rendererModule.renderTemplate as jest.Mock).mockReturnValue('on: push\njobs:\n  build:\n    runs-on: ubuntu-latest');

    const plan: GenerationPlan = {
      files: [
        { path: '.github/workflows/deploy-dev.yml', templateId: 'multi-env-deploy', variables: [] },
        { path: '.github/workflows/deploy-prod.yml', templateId: 'multi-env-deploy', variables: [] },
      ],
      planHash: 't2',
      framework: Framework.EXPRESS,
      deploymentTarget: DeploymentTarget.DOCKER,
      generatedAt: new Date().toISOString(),
      devforgeVersion: '1.0.0',
    };

    const result = await runGenerator(plan, mockFs);

    expect(result.written).toContain('.github/workflows/deploy-dev.yml');
    expect(result.written).toContain('.github/workflows/deploy-prod.yml');
    expect(result.errors.length).toBe(0);
  });
});
