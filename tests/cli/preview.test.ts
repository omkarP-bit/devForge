import { DeploymentTarget, Framework } from '../../src/types';
import { GenerationPlan, PlannedFile } from '../../src/engine/ruleEngine';
import {
  previewGenerationPlan,
  isPreviewModeNonDestructive,
  countGeneratedFiles,
  getGeneratedFilePaths,
  getUsedTemplateIds,
} from '../../src/cli/preview';
import * as templateModule from '../../src/templates';

// Mock modules
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/templates', () => ({
  getTemplate: jest.fn(),
}));

jest.mock('../../src/engine/templateRenderer', () => ({
  renderTemplate: jest.fn(),
}));

describe('Preview CLI Module', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // ─────────────────────────────────────────────────────────────────
  // Basic Preview Rendering Tests
  // ─────────────────────────────────────────────────────────────────

  describe('Basic Preview Rendering', () => {
    it('should preview a generation plan with single file', () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/base-ci.yml',
            templateId: 'base-ci',
            variables: [
              { key: 'nodeVersion', value: '18' },
            ],
          },
        ],
        planHash: 'abc123',
        framework: Framework.NEXTJS,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      jest
        .mocked(templateModule.getTemplate)
        .mockReturnValue('name: CI\nnode: {{nodeVersion}}');

      jest.mocked(require('../../src/engine/templateRenderer').renderTemplate).mockReturnValue(
        'name: CI\nnode: 18',
      );

      let capturedOutput = '';
      previewGenerationPlan(plan, (output) => {
        capturedOutput = output;
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(capturedOutput).toContain('.github/workflows/base-ci.yml');
      expect(capturedOutput).toContain('DEVFORGE GENERATION PREVIEW');
    });

    it('should preview multiple files', () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/base-ci.yml',
            templateId: 'base-ci',
            variables: [{ key: 'nodeVersion', value: '18' }],
          },
          {
            path: 'Dockerfile',
            templateId: 'dockerfile-node',
            variables: [{ key: 'nodeVersion', value: '18' }],
          },
          {
            path: 'docker-compose.yml',
            templateId: 'docker-compose',
            variables: [],
          },
        ],
        planHash: 'def456',
        framework: Framework.EXPRESS,
        deploymentTarget: DeploymentTarget.DOCKER,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      jest
        .mocked(templateModule.getTemplate)
        .mockReturnValue('template content');

      jest.mocked(require('../../src/engine/templateRenderer').renderTemplate).mockReturnValue(
        'rendered content',
      );

      let capturedOutput = '';
      previewGenerationPlan(plan, (output) => {
        capturedOutput = output;
      });

      expect(capturedOutput).toContain('.github/workflows/base-ci.yml');
      expect(capturedOutput).toContain('Dockerfile');
      expect(capturedOutput).toContain('docker-compose.yml');
      expect(capturedOutput).toContain('Ready to generate 3 files');
    });

    it('should handle empty plan gracefully', () => {
      const plan: GenerationPlan = {
        files: [],
        planHash: 'empty',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      previewGenerationPlan(plan);

      const mockLogger = require('../../src/utils/logger').logger;
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No files to generate in this plan',
      );
    });

    it('should handle null plan gracefully', () => {
      const plan = null as unknown as GenerationPlan;

      previewGenerationPlan(plan);

      const mockLogger = require('../../src/utils/logger').logger;
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // File Content Formatting Tests
  // ─────────────────────────────────────────────────────────────────

  describe('File Content Formatting', () => {
    it('should format file with few lines', () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.dockerignore',
            templateId: 'dockerignore',
            variables: [],
          },
        ],
        planHash: 'fmt1',
        framework: Framework.EXPRESS,
        deploymentTarget: DeploymentTarget.DOCKER,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      const shortContent = 'node_modules\n.git\n.env';

      jest
        .mocked(templateModule.getTemplate)
        .mockReturnValue('template');

      jest.mocked(require('../../src/engine/templateRenderer').renderTemplate).mockReturnValue(
        shortContent,
      );

      let capturedOutput = '';
      previewGenerationPlan(plan, (output) => {
        capturedOutput = output;
      });

      expect(capturedOutput).toContain('node_modules');
      expect(capturedOutput).toContain('.git');
      expect(capturedOutput).not.toContain('and');
    });

    it('should truncate file with many lines', () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/long.yml',
            templateId: 'base-ci',
            variables: [],
          },
        ],
        planHash: 'fmt2',
        framework: Framework.NEXTJS,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      // Create content with 50 lines
      const longContent = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n');

      jest
        .mocked(templateModule.getTemplate)
        .mockReturnValue('template');

      jest.mocked(require('../../src/engine/templateRenderer').renderTemplate).mockReturnValue(
        longContent,
      );

      let capturedOutput = '';
      previewGenerationPlan(plan, (output) => {
        capturedOutput = output;
      });

      expect(capturedOutput).toContain('line 1');
      expect(capturedOutput).toContain('line 20');
      expect(capturedOutput).toContain('and 30 more lines');
    });

    it('should include line numbers in output', () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: 'Dockerfile',
            templateId: 'dockerfile-node',
            variables: [],
          },
        ],
        planHash: 'fmt3',
        framework: Framework.EXPRESS,
        deploymentTarget: DeploymentTarget.DOCKER,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      const content = 'FROM node:18\nRUN npm install\nCMD npm start';

      jest
        .mocked(templateModule.getTemplate)
        .mockReturnValue('template');

      jest.mocked(require('../../src/engine/templateRenderer').renderTemplate).mockReturnValue(
        content,
      );

      let capturedOutput = '';
      previewGenerationPlan(plan, (output) => {
        capturedOutput = output;
      });

      // Should have line numbers like "  1 │", "  2 │", etc.
      expect(capturedOutput).toMatch(/^\s+1\s*│/m);
      expect(capturedOutput).toContain('FROM node:18');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Error Handling Tests
  // ─────────────────────────────────────────────────────────────────

  describe('Error Handling', () => {
    it('should handle template rendering errors', () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/broken.yml',
            templateId: 'base-ci',
            variables: [{ key: 'nodeVersion', value: '18' }],
          },
        ],
        planHash: 'err1',
        framework: Framework.NEXTJS,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      jest
        .mocked(templateModule.getTemplate)
        .mockReturnValue('template');

      const mockRender = jest.mocked(require('../../src/engine/templateRenderer').renderTemplate);
      mockRender.mockImplementation(() => {
        throw new Error('Undefined variable: missingVar');
      });

      previewGenerationPlan(plan);

      const mockLogger = require('../../src/utils/logger').logger;
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to render file'),
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Some files failed to render',
      );
    });

    it('should handle missing template', () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/broken.yml',
            templateId: 'nonexistent',
            variables: [],
          },
        ],
        planHash: 'err2',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      jest
        .mocked(templateModule.getTemplate)
        .mockImplementation(() => {
          throw new Error('Template not found: nonexistent');
        });

      previewGenerationPlan(plan);

      const mockLogger = require('../../src/utils/logger').logger;
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should continue after partial failures', () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: 'good.yml',
            templateId: 'base-ci',
            variables: [],
          },
          {
            path: 'bad.yml',
            templateId: 'broken',
            variables: [],
          },
          {
            path: 'also-good.yml',
            templateId: 'base-ci',
            variables: [],
          },
        ],
        planHash: 'err3',
        framework: Framework.NEXTJS,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      const mockGetTemplate = jest.mocked(templateModule.getTemplate);
      mockGetTemplate.mockImplementation((id) => {
        if (id === 'broken') throw new Error('Missing template');
        return 'good content';
      });

      jest.mocked(require('../../src/engine/templateRenderer').renderTemplate).mockReturnValue(
        'rendered',
      );

      let capturedOutput = '';
      previewGenerationPlan(plan, (output) => {
        capturedOutput = output;
      });

      // Should show at least the good files
      expect(capturedOutput).toContain('good.yml');
      expect(capturedOutput).toContain('also-good.yml');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Summary Display Tests
  // ─────────────────────────────────────────────────────────────────

  describe('Summary Display', () => {
    it('should display singular "file" for single file', () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: 'Dockerfile',
            templateId: 'dockerfile-node',
            variables: [],
          },
        ],
        planHash: 'sum1',
        framework: Framework.EXPRESS,
        deploymentTarget: DeploymentTarget.DOCKER,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      jest
        .mocked(templateModule.getTemplate)
        .mockReturnValue('content');

      jest.mocked(require('../../src/engine/templateRenderer').renderTemplate).mockReturnValue(
        'content',
      );

      let capturedOutput = '';
      previewGenerationPlan(plan, (output) => {
        capturedOutput = output;
      });

      expect(capturedOutput).toContain('Ready to generate 1 file');
    });

    it('should display plural "files" for multiple files', () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: 'Dockerfile',
            templateId: 'dockerfile-node',
            variables: [],
          },
          {
            path: 'docker-compose.yml',
            templateId: 'docker-compose',
            variables: [],
          },
        ],
        planHash: 'sum2',
        framework: Framework.EXPRESS,
        deploymentTarget: DeploymentTarget.DOCKER,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      jest
        .mocked(templateModule.getTemplate)
        .mockReturnValue('content');

      jest.mocked(require('../../src/engine/templateRenderer').renderTemplate).mockReturnValue(
        'content',
      );

      let capturedOutput = '';
      previewGenerationPlan(plan, (output) => {
        capturedOutput = output;
      });

      expect(capturedOutput).toContain('Ready to generate 2 files');
    });

    it('should include framework and deployment target', () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/base-ci.yml',
            templateId: 'base-ci',
            variables: [],
          },
        ],
        planHash: 'sum3',
        framework: Framework.NESTJS,
        deploymentTarget: DeploymentTarget.RAILWAY,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      jest
        .mocked(templateModule.getTemplate)
        .mockReturnValue('content');

      jest.mocked(require('../../src/engine/templateRenderer').renderTemplate).mockReturnValue(
        'content',
      );

      let capturedOutput = '';
      previewGenerationPlan(plan, (output) => {
        capturedOutput = output;
      });

      expect(capturedOutput).toContain('nestjs');
      expect(capturedOutput).toContain('railway');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Helper Function Tests
  // ─────────────────────────────────────────────────────────────────

  describe('Helper Functions', () => {
    it('isPreviewModeNonDestructive should return true', () => {
      expect(isPreviewModeNonDestructive()).toBe(true);
    });

    it('countGeneratedFiles should return correct count', () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: 'file1.yml',
            templateId: 'base-ci',
            variables: [],
          },
          {
            path: 'file2.yml',
            templateId: 'base-ci',
            variables: [],
          },
          {
            path: 'file3.yml',
            templateId: 'base-ci',
            variables: [],
          },
        ],
        planHash: 'help1',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      expect(countGeneratedFiles(plan)).toBe(3);
    });

    it('countGeneratedFiles should return 0 for empty plan', () => {
      const plan: GenerationPlan = {
        files: [],
        planHash: 'help2',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      expect(countGeneratedFiles(plan)).toBe(0);
    });

    it('getGeneratedFilePaths should return all file paths', () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/ci.yml',
            templateId: 'base-ci',
            variables: [],
          },
          {
            path: 'Dockerfile',
            templateId: 'dockerfile-node',
            variables: [],
          },
          {
            path: 'docker-compose.yml',
            templateId: 'docker-compose',
            variables: [],
          },
        ],
        planHash: 'help3',
        framework: Framework.EXPRESS,
        deploymentTarget: DeploymentTarget.DOCKER,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      const paths = getGeneratedFilePaths(plan);
      expect(paths).toEqual([
        '.github/workflows/ci.yml',
        'Dockerfile',
        'docker-compose.yml',
      ]);
    });

    it('getGeneratedFilePaths should return empty array for empty plan', () => {
      const plan: GenerationPlan = {
        files: [],
        planHash: 'help4',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      expect(getGeneratedFilePaths(plan)).toEqual([]);
    });

    it('getUsedTemplateIds should return unique template IDs', () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: 'file1.yml',
            templateId: 'base-ci',
            variables: [],
          },
          {
            path: 'file2.yml',
            templateId: 'vercel-deploy',
            variables: [],
          },
          {
            path: 'file3.yml',
            templateId: 'base-ci', // Duplicate
            variables: [],
          },
        ],
        planHash: 'help5',
        framework: Framework.NEXTJS,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      const ids = getUsedTemplateIds(plan);
      expect(ids).toContain('base-ci');
      expect(ids).toContain('vercel-deploy');
      expect(ids.length).toBe(2);
      expect(ids).toEqual(ids.sort()); // Should be sorted
    });

    it('getUsedTemplateIds should return empty array for empty plan', () => {
      const plan: GenerationPlan = {
        files: [],
        planHash: 'help6',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      expect(getUsedTemplateIds(plan)).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Integration Tests
  // ─────────────────────────────────────────────────────────────────

  describe('Integration with Other Modules', () => {
    it('should work with real-world generation plan structure', () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/base-ci.yml',
            templateId: 'base-ci',
            variables: [
              { key: 'nodeVersion', value: '18' },
              { key: 'packageManager', value: 'npm' },
              { key: 'installCommand', value: 'npm ci' },
              { key: 'buildCommand', value: 'npm run build' },
              { key: 'testCommand', value: 'npm test' },
            ],
          },
          {
            path: '.github/workflows/deploy.yml',
            templateId: 'vercel-deploy',
            variables: [
              { key: 'nodeVersion', value: '18' },
              { key: 'framework', value: 'nextjs' },
            ],
          },
          {
            path: 'Dockerfile',
            templateId: 'dockerfile-nextjs',
            variables: [{ key: 'nodeVersion', value: '18' }],
          },
        ],
        planHash: 'int1',
        framework: Framework.NEXTJS,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      jest
        .mocked(templateModule.getTemplate)
        .mockReturnValue('template content');

      jest.mocked(require('../../src/engine/templateRenderer').renderTemplate).mockImplementation(
        (_template: string, variables: Map<string, string>) => {
          // Simple mock renderer
          let result = 'Generated content';
          if (variables.has('nodeVersion')) {
            result += ` [Node ${variables.get('nodeVersion')}]`;
          }
          return result;
        },
      );

      let capturedOutput = '';
      previewGenerationPlan(plan, (output) => {
        capturedOutput = output;
      });

      expect(capturedOutput).toContain('.github/workflows/base-ci.yml');
      expect(capturedOutput).toContain('.github/workflows/deploy.yml');
      expect(capturedOutput).toContain('Dockerfile');
      expect(capturedOutput).toContain('Ready to generate 3 files');
      expect(getUsedTemplateIds(plan)).toEqual([
        'base-ci',
        'dockerfile-nextjs',
        'vercel-deploy',
      ]);
    });
  });
});
