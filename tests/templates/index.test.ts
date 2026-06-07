import {
  TEMPLATES,
  getTemplate,
  getAvailableTemplateIds,
  validateTemplateRegistry,
  checkTemplateSecurityIssues,
  TemplateRegistrySchema,
} from '../../src/templates/index';

describe('Template Storage', () => {
  describe('Template Registry', () => {
    it('should export TEMPLATES object with all required templates', () => {
      expect(TEMPLATES).toBeDefined();
      expect(typeof TEMPLATES).toBe('object');
    });

    it('should have exactly 20 templates', () => {
      const templateIds = Object.keys(TEMPLATES);
      expect(templateIds).toHaveLength(20);
    });

    it('should contain all required template IDs', () => {
      const requiredIds = [
        'base-ci',
        'vercel-deploy',
        'railway-deploy',
        'render-deploy',
        'aws-ec2-deploy',
        'docker-build',
        'docker-compose',
        'dockerfile-node',
        'dockerfile-nextjs',
        'dockerignore',
        'multi-env-deploy',
        'eks-workflow',
        'eks-k8s-deployment',
        'eks-k8s-service',
        'eks-k8s-ingress',
        'eks-secrets-required',
        'ecs-workflow',
        'ecs-task-definition',
        'ecs-readme',
        'ecs-secrets-required',
      ];
      requiredIds.forEach((id) => {
        expect(TEMPLATES).toHaveProperty(id);
      });
    });

    it('should not have empty template strings', () => {
      Object.entries(TEMPLATES).forEach(([id, template]) => {
        expect((template as string).length).toBeGreaterThan(0);
        expect(template).not.toBe('');
      });
    });

    it('should have all templates as strings', () => {
      Object.entries(TEMPLATES).forEach(([id, template]) => {
        expect(typeof template).toBe('string');
      });
    });
  });

  describe('getTemplate function', () => {
    it('should retrieve a template by ID', () => {
      const baseCiTemplate = getTemplate('base-ci');
      expect(baseCiTemplate).toBeDefined();
      expect(baseCiTemplate.length).toBeGreaterThan(0);
      expect(baseCiTemplate).toContain('name: Base CI');
    });

    it('should retrieve all available templates without error', () => {
      const templateIds = Object.keys(TEMPLATES);
      templateIds.forEach((id) => {
        expect(() => getTemplate(id)).not.toThrow();
      });
    });

    it('should throw error for non-existent template', () => {
      expect(() => getTemplate('non-existent-template')).toThrow(
        'Template not found: non-existent-template'
      );
    });

    it('should throw error for empty string ID', () => {
      expect(() => getTemplate('')).toThrow('Template not found:');
    });
  });

  describe('getAvailableTemplateIds function', () => {
    it('should return array of template IDs', () => {
      const ids = getAvailableTemplateIds();
      expect(Array.isArray(ids)).toBe(true);
    });

    it('should return exactly 20 template IDs', () => {
      const ids = getAvailableTemplateIds();
      expect(ids).toHaveLength(20);
    });

    it('should return IDs that match TEMPLATES object keys', () => {
      const ids = getAvailableTemplateIds();
      const templateKeys = Object.keys(TEMPLATES);
      expect(ids.sort()).toEqual(templateKeys.sort());
    });
  });

  describe('validateTemplateRegistry function', () => {
    it('should validate successful registry structure', () => {
      const isValid = validateTemplateRegistry();
      expect(isValid).toBe(true);
    });

    it('should satisfy Zod schema validation', () => {
      const result = TemplateRegistrySchema.safeParse(TEMPLATES);
      expect(result.success).toBe(true);
    });
  });

  describe('Handlebars Variable Usage', () => {
    it('base-ci should contain Handlebars variables', () => {
      const template = getTemplate('base-ci');
      expect(template).toMatch(/\{\{nodeVersion\}\}/);
      expect(template).toMatch(/\{\{packageManager\}\}/);
      expect(template).toMatch(/\{\{installCommand\}\}/);
      expect(template).toMatch(/\{\{testCommand\}\}/);
      expect(template).toMatch(/\{\{buildCommand\}\}/);
    });

    it('vercel-deploy should contain deployment-specific variables', () => {
      const template = getTemplate('vercel-deploy');
      expect(template).toMatch(/\{\{nodeVersion\}\}/);
      expect(template).toMatch(/secrets\.VERCEL_TOKEN/);
    });

    it('dockerfile-node should contain build variables', () => {
      const template = getTemplate('dockerfile-node');
      expect(template).toMatch(/\{\{nodeVersion\}\}/);
      expect(template).toMatch(/\{\{packageManager\}\}/);
      expect(template).toMatch(/\{\{installCommand\}\}/);
      expect(template).toMatch(/\{\{buildCommand\}\}/);
    });

    it('dockerfile-nextjs should mention Next.js specific files', () => {
      const template = getTemplate('dockerfile-nextjs');
      expect(template).toContain('.next');
      expect(template).toContain('/public');
    });

    it('multi-env-deploy should contain environment variables', () => {
      const template = getTemplate('multi-env-deploy');
      expect(template).toMatch(/\{\{environment\}\}/);
      expect(template).toContain('name: {{environment}}');
    });
  });

  describe('GitHub Actions Secrets', () => {
    it('base-ci should use GitHub Actions format for secrets', () => {
      const template = getTemplate('base-ci');
      // Should not contain secrets (base-ci is generic)
      expect(template).not.toContain('secrets.');
    });

    it('vercel-deploy should reference Vercel secrets correctly', () => {
      const template = getTemplate('vercel-deploy');
      expect(template).toMatch(/\$\{\{\s*secrets\.VERCEL_TOKEN\s*\}\}/);
      expect(template).toMatch(/\$\{\{\s*secrets\.VERCEL_ORG_ID\s*\}\}/);
      expect(template).toMatch(/\$\{\{\s*secrets\.VERCEL_PROJECT_ID\s*\}\}/);
    });

    it('railway-deploy should reference Railway secret correctly', () => {
      const template = getTemplate('railway-deploy');
      expect(template).toMatch(/\$\{\{\s*secrets\.RAILWAY_TOKEN\s*\}\}/);
    });

    it('render-deploy should reference Render webhook correctly', () => {
      const template = getTemplate('render-deploy');
      expect(template).toMatch(/\$\{\{\s*secrets\.RENDER_DEPLOY_HOOK\s*\}\}/);
    });

    it('aws-ec2-deploy should reference AWS secrets correctly', () => {
      const template = getTemplate('aws-ec2-deploy');
      expect(template).toMatch(/\$\{\{\s*secrets\.AWS_EC2_HOST\s*\}\}/);
      expect(template).toMatch(/\$\{\{\s*secrets\.AWS_EC2_USERNAME\s*\}\}/);
      expect(template).toMatch(/\$\{\{\s*secrets\.AWS_EC2_SSH_KEY\s*\}\}/);
    });

    it('docker-build should reference Docker Hub credentials', () => {
      const template = getTemplate('docker-build');
      expect(template).toMatch(/\$\{\{\s*secrets\.DOCKER_HUB_USERNAME\s*\}\}/);
      expect(template).toMatch(/\$\{\{\s*secrets\.DOCKER_HUB_PASSWORD\s*\}\}/);
    });
  });

  describe('Security Checks', () => {
    it('should not contain hardcoded tokens', () => {
      Object.entries(TEMPLATES).forEach(([id, template]) => {
        // Look for suspicious long strings that might be tokens
        const suspiciousPattern = /['"][a-zA-Z0-9]{40,}['"]/;
        expect(template).not.toMatch(suspiciousPattern);
      });
    });

    it('should not contain private keys', () => {
      Object.entries(TEMPLATES).forEach(([id, template]) => {
        expect(template).not.toMatch(/BEGIN RSA PRIVATE/);
        expect(template).not.toMatch(/BEGIN PRIVATE KEY/);
        expect(template).not.toMatch(/-----BEGIN/);
      });
    });

    it('should not contain plaintext passwords', () => {
      Object.entries(TEMPLATES).forEach(([id, template]) => {
        expect(template).not.toMatch(/password\s*=\s*['"][^'"]{5,}['"]/i);
      });
    });

    it('checkTemplateSecurityIssues should return empty array for clean templates', () => {
      const warnings = checkTemplateSecurityIssues();
      expect(Array.isArray(warnings)).toBe(true);
      expect(warnings).toHaveLength(0);
    });
  });

  describe('Template Syntax', () => {
    it('GitHub Actions templates should have proper YAML syntax', () => {
      const workflows = [
        'base-ci',
        'vercel-deploy',
        'railway-deploy',
        'render-deploy',
        'aws-ec2-deploy',
        'docker-build',
        'multi-env-deploy',
      ];
      workflows.forEach((id) => {
        const template = getTemplate(id);
        expect(template).toContain('name:');
        expect(template).toContain('on:');
        expect(template).toContain('jobs:');
        expect(template).toContain('runs-on:');
        expect(template).toContain('steps:');
      });
    });

    it('Dockerfile templates should have proper Docker syntax', () => {
      const dockerfiles = ['dockerfile-node', 'dockerfile-nextjs'];
      dockerfiles.forEach((id) => {
        const template = getTemplate(id);
        expect(template).toContain('FROM node:');
        expect(template).toContain('WORKDIR /app');
        expect(template).toContain('RUN');
      });
    });

    it('docker-compose should have valid YAML structure', () => {
      const template = getTemplate('docker-compose');
      expect(template).toContain("version: '3.8'");
      expect(template).toContain('services:');
      expect(template).toContain('volumes:');
    });

    it('dockerignore should have proper format', () => {
      const template = getTemplate('dockerignore');
      const lines = template.split('\n').filter((line: string) => line.trim().length > 0);
      expect(lines.length).toBeGreaterThan(0);
      // Each line should be a file/folder pattern
      lines.forEach((line: string) => {
        expect(line).not.toContain('\t');
      });
    });
  });

  describe('Framework Compatibility', () => {
    it('dockerfile-nextjs should mention Next.js specific files', () => {
      const template = getTemplate('dockerfile-nextjs');
      expect(template).toContain('.next');
      expect(template).toContain('/public');
    });

    it('dockerfile-node should not mention Next.js specific files', () => {
      const template = getTemplate('dockerfile-node');
      expect(template).not.toContain('.next/');
    });

    it('both dockerfiles should expose port 3000', () => {
      const node = getTemplate('dockerfile-node');
      const nextjs = getTemplate('dockerfile-nextjs');
      expect(node).toContain('EXPOSE 3000');
      expect(nextjs).toContain('EXPOSE 3000');
    });

    it('both dockerfiles should have health checks', () => {
      const node = getTemplate('dockerfile-node');
      const nextjs = getTemplate('dockerfile-nextjs');
      expect(node).toContain('HEALTHCHECK');
      expect(nextjs).toContain('HEALTHCHECK');
    });

    it('both dockerfiles should create non-root user', () => {
      const node = getTemplate('dockerfile-node');
      const nextjs = getTemplate('dockerfile-nextjs');
      expect(node).toContain('addgroup');
      expect(node).toContain('adduser');
      expect(nextjs).toContain('addgroup');
      expect(nextjs).toContain('adduser');
    });
  });

  describe('Template Content Validation', () => {
    it('should have reasonable template sizes', () => {
      Object.entries(TEMPLATES).forEach(([id, template]) => {
        // Templates should be at least 100 chars and at most 50KB
        expect((template as string).length).toBeGreaterThanOrEqual(100);
        expect((template as string).length).toBeLessThan(50000);
      });
    });

    it('should use consistent variable naming', () => {
      const templates = Object.values(TEMPLATES);
      const allowedVars = [
        'devforgeVersion',
        'nodeVersion',
        'packageManager',
        'installCommand',
        'buildCommand',
        'testCommand',
        'framework',
        'environments',
        'environment',
        'major',
        'minor',
        'hasTests',
        'hasLinting',
        'deploymentTarget',
        'AWS_REGION',
        'ECR_REGISTRY',
        'IMAGE_NAME',
        'TASK_FAMILY',
        'CPU',
        'MEMORY',
        'EXECUTION_ROLE_ARN',
        'CONTAINER_NAME',
        'PORT',
        'ECS_CLUSTER',
        'ECS_SERVICE',
        'EKS_CLUSTER_NAME',
        'APP_NAME',
        'REPLICAS',
        'DOMAIN',
      ];

      templates.forEach((template) => {
        const varMatches = (template as string).match(/\{\{(\w+)[\s|]*[\w]*\}\}/g) || [];
        const extractedVars = varMatches.map((m: string) => m.match(/\{\{(\w+)/)?.[1]);

        extractedVars.forEach((varName: string | undefined) => {
          if (varName && !varName.includes('format')) {
            // Allow 'format' filter for conditional vars
            expect(allowedVars).toContain(varName);
          }
        });
      });
    });

    it('should reference only valid secret names', () => {
      const templates = Object.values(TEMPLATES);
      const validSecrets = [
        'VERCEL_TOKEN',
        'VERCEL_ORG_ID',
        'VERCEL_PROJECT_ID',
        'RAILWAY_TOKEN',
        'RENDER_DEPLOY_HOOK',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_ROLE_ARN',
        'AWS_REGION',
        'AWS_EC2_HOST',
        'AWS_EC2_USERNAME',
        'AWS_EC2_SSH_KEY',
        'EC2_INSTANCE_ID',
        'S3_BUCKET',
        'DOCKER_HUB_USERNAME',
        'DOCKER_HUB_PASSWORD',
        'GITHUB_TOKEN',
        'DEPLOYMENT_TOKEN',
      ];

      templates.forEach((template) => {
        const secretMatches = (template as string).match(/secrets\.(\w+)/g) || [];
        secretMatches.forEach((match: string) => {
          const secretName = match.replace('secrets.', '').replace('DEPLOYMENT_TOKEN_', 'DEPLOYMENT_TOKEN');
          expect(validSecrets).toContain(secretName);
        });
      });
    });
  });

  describe('Template Interpolation Markers', () => {
    it('should escape GitHub Actions variable syntax correctly', () => {
      Object.values(TEMPLATES).forEach((template) => {
        // GitHub Actions variables should use ${{ ... }} syntax
        const githubVars = (template as string).match(/\$\{\{[\s\w.]+\}\}/g) || [];
        githubVars.forEach((gvar: string) => {
          // All GitHub variables should have proper escaping
          expect(gvar).toMatch(/^\$\{\{/);
          expect(gvar).toMatch(/\}\}$/);
        });
      });
    });

    it('should not have conflicting variable syntaxes', () => {
      // Skip templates that use their own variable syntax
      // - dockerignore: plain config file, no variables
      // - docker-compose: uses Docker's ${...} syntax, not our templates
      const skippedTemplates = new Set(['dockerignore', 'docker-compose']);
      const templates = Object.entries(TEMPLATES);
      templates.forEach(([templateId, template]) => {
        if (skippedTemplates.has(templateId)) return;

        // Count handlebars vars and github vars
        const handlebarsCount = ((template as string).match(/\{\{[^$]/g) || []).length;
        const githubCount = ((template as string).match(/\$\{\{/g) || []).length;

        // Both should be valid, but not mixed in a confusing way
        expect(handlebarsCount + githubCount).toBeGreaterThan(0);
      });
    });
  });

  describe('Deployment Target Coverage', () => {
    it('should have templates for all deployment targets', () => {
      const deploymentTemplates = [
        'base-ci',
        'vercel-deploy',
        'railway-deploy',
        'render-deploy',
        'aws-ec2-deploy',
        'docker-build',
      ];
      deploymentTemplates.forEach((id) => {
        expect(() => getTemplate(id)).not.toThrow();
      });
    });

    it('each deployment template should reference appropriate services', () => {
      expect(getTemplate('vercel-deploy')).toContain('Vercel');
      expect(getTemplate('railway-deploy')).toContain('Railway');
      expect(getTemplate('render-deploy')).toContain('Render');
      expect(getTemplate('aws-ec2-deploy')).toContain('AWS');
      expect(getTemplate('docker-build')).toContain('Docker');
    });
  });

  describe('Integration with RuleEngine', () => {
    it('should have all templates referenced by AVAILABLE_TEMPLATES', () => {
      // AVAILABLE_TEMPLATES from ruleEngine should match our template IDs
      const expectedIds = [
        'base-ci',
        'vercel-deploy',
        'railway-deploy',
        'render-deploy',
        'aws-ec2-deploy',
        'docker-build',
        'docker-compose',
        'dockerfile-node',
        'dockerfile-nextjs',
        'dockerignore',
        'multi-env-deploy',
        'eks-workflow',
        'eks-k8s-deployment',
        'eks-k8s-service',
        'eks-k8s-ingress',
        'eks-secrets-required',
        'ecs-workflow',
        'ecs-task-definition',
        'ecs-readme',
        'ecs-secrets-required',
      ];
      const actualIds = getAvailableTemplateIds().sort();
      expect(actualIds).toEqual(expectedIds.sort());
    });
  });
});
