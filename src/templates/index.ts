/**
 * Template Storage Module
 *
 * All CI/CD and Docker templates are embedded as string constants here.
 * Templates are read at build time and compiled into the distributed package.
 * This design eliminates runtime file I/O and reduces attack surface.
 *
 * Template Format: Handlebars syntax with {{variable}} placeholders
 * Variables are safe-substituted during generation phase
 * Secret references use GitHub Actions format: ${{ secrets.SECRET_NAME }}
 */

import { z } from 'zod';

/**
 * Base CI workflow - runs on every pull request and push to main
 * Includes linting, testing, and build validation with proper permissions
 */
const BASE_CI_TEMPLATE =
  "name: Base CI\n\non:\n  push:\n    branches: [main, develop]\n  pull_request:\n    branches: [main, develop]\n\npermissions:\n  contents: read\n  checks: write\n  pull-requests: write\n\njobs:\n  lint:\n    runs-on: ubuntu-latest\n    strategy:\n      matrix:\n        node-version: [{{nodeVersion}}]\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: ${{ matrix.node-version }}\n          cache: '{{packageManager}}'\n      - run: {{installCommand}}\n      - run: npm run lint --if-present || echo \"No lint script\"\n\n  test:\n    runs-on: ubuntu-latest\n    strategy:\n      matrix:\n        node-version: [{{nodeVersion}}]\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: ${{ matrix.node-version }}\n          cache: '{{packageManager}}'\n      - run: {{installCommand}}\n      - run: {{testCommand}}\n\n  build:\n    runs-on: ubuntu-latest\n    needs: [lint, test]\n    if: always()\n    strategy:\n      matrix:\n        node-version: [{{nodeVersion}}]\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: ${{ matrix.node-version }}\n          cache: '{{packageManager}}'\n      - run: {{installCommand}}\n      - run: {{buildCommand}}\n      - uses: actions/upload-artifact@v4\n        with:\n          name: build-${{ matrix.node-version }}\n          path: dist/\n          retention-days: 5\n";

/**
 * Vercel deployment workflow - optimized for Vercel edge platform
 * Production deployment with environment setup
 */
const VERCEL_DEPLOY_TEMPLATE =
  "name: Deploy to Vercel\n\non:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [main]\n\npermissions:\n  contents: read\n  deployments: write\n  pull-requests: write\n\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    environment:\n      name: ${{ github.event_name == 'push' && 'production' || 'preview' }}\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: {{nodeVersion}}\n          cache: \"{{packageManager}}\"\n      - run: {{installCommand}}\n      - run: {{buildCommand}}\n      - name: Deploy to Vercel\n        uses: amondnet/vercel-action@v25\n        id: vercel\n        with:\n          vercel-token: \"${{ secrets.VERCEL_TOKEN }}\"\n          vercel-org-id: \"${{ secrets.VERCEL_ORG_ID }}\"\n          vercel-project-id: \"${{ secrets.VERCEL_PROJECT_ID }}\"\n          working-directory: ./\n      - name: Comment PR with deployment URL\n        if: github.event_name == 'pull_request'\n        uses: actions/github-script@v7\n        with:\n          script: |\n            github.rest.issues.createComment({\n              issue_number: context.issue.number,\n              owner: context.repo.owner,\n              repo: context.repo.repo,\n              body: '✨ Preview deployed to: ${{ steps.vercel.outputs.preview-url }}'\n            })\n";

/**
 * Railway deployment workflow - for Railway hosted deployments
 * Uses Railway CLI via NPM for deployments
 */
const RAILWAY_DEPLOY_TEMPLATE =
  "name: Deploy to Railway\n\non:\n  push:\n    branches: [main]\n\npermissions:\n  contents: read\n  deployments: write\n\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    environment:\n      name: production\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: {{nodeVersion}}\n          cache: \"{{packageManager}}\"\n      - run: {{installCommand}}\n      - run: {{buildCommand}}\n      - name: Deploy via Railway\n        run: npx railway up --service ${{ github.event.repository.name }} --environment production\n        env:\n          RAILWAY_TOKEN: \"${{ secrets.RAILWAY_TOKEN }}\"\n";

/**
 * Render deployment workflow - for Render hosted deployments
 * Uses Render deploy hook for automated deployments
 */
const RENDER_DEPLOY_TEMPLATE =
  // eslint-disable-next-line no-useless-escape
  'name: Deploy to Render\n\non:\n  push:\n    branches: [main]\n\npermissions:\n  contents: read\n  deployments: write\n\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    environment:\n      name: production\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          fetch-depth: 0\n      - name: Trigger Render deployment\n        run: |\n          curl --request POST \\\n            --url \"${{ secrets.RENDER_DEPLOY_HOOK }}\" \\\n            --header \"Content-Type: application/json\" \\\n            --data \'{\n              \"gitCommitSha\": \"${{ github.sha }}\",\n              \"gitCommitMessage\": \"${{ github.event.head_commit.message }}\",\n              \"gitBranch\": \"${{ github.ref_name }}\"\n            }\'\n      - name: Wait for Render deployment\n        run: sleep 30\n      - name: Check deployment status\n        run: echo \"✓ Deployment triggered on Render\"\n';

/**
 * AWS EC2 deployment workflow - for EC2 instance deployments
 * Uses SSH for secure deployment and pm2 for process management
 */
const AWS_EC2_DEPLOY_TEMPLATE =
  "name: Deploy to AWS EC2\n\non:\n  push:\n    branches: [main]\n\npermissions:\n  contents: read\n  deployments: write\n\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    environment:\n      name: production\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: {{nodeVersion}}\n          cache: \"{{packageManager}}\"\n      - run: {{installCommand}}\n      - run: {{buildCommand}}\n      - name: Deploy to EC2 via SSH\n        uses: appleboy/ssh-action@v1.0.3\n        with:\n          host: \"${{ secrets.AWS_EC2_HOST }}\"\n          username: \"${{ secrets.AWS_EC2_USERNAME }}\"\n          key: \"${{ secrets.AWS_EC2_SSH_KEY }}\"\n          port: 22\n          timeout: 30s\n          command_timeout: 60s\n          script: |\n            cd ~/app\n            git pull origin main\n            {{installCommand}}\n            {{buildCommand}}\n            pm2 restart app || pm2 start \"{{buildCommand}}\" --name app\n            pm2 save\n"

/**
 * Docker build and push workflow
 * Builds Docker image and pushes to registry with caching
 */
const DOCKER_BUILD_TEMPLATE =
  "name: Build and Push Docker Image\n\non:\n  push:\n    branches: [main]\n    tags: ['v*']\n\npermissions:\n  contents: read\n  packages: write\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: docker/setup-buildx-action@v3\n      - uses: docker/login-action@v3\n        with:\n          username: \"${{ secrets.DOCKER_HUB_USERNAME }}\"\n          password: \"${{ secrets.DOCKER_HUB_PASSWORD }}\"\n      - uses: docker/metadata-action@v5\n        id: meta\n        with:\n          images: ${{ secrets.DOCKER_HUB_USERNAME }}/app\n          tags: |\n            type=sha\n            type=ref,event=branch\n            type=semver,pattern=v{{major}}.{{minor}}\n      - uses: docker/build-push-action@v5\n        with:\n          context: .\n          push: ${{ github.event_name != 'pull_request' }}\n          tags: ${{ steps.meta.outputs.tags }}\n          labels: ${{ steps.meta.outputs.labels }}\n          cache-from: type=gha\n          cache-to: type=gha,mode=max\n";

/**
 * Multi-environment deployment workflow
 * Deploys to multiple environments with proper permissions and environment switching
 */
const MULTI_ENV_DEPLOY_TEMPLATE =
  "name: Deploy to Environment\n\non:\n  push:\n    branches: [main, develop]\n\npermissions:\n  contents: read\n  deployments: write\n\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    strategy:\n      matrix:\n        environment: {{environments}}\n    environment:\n      name: ${{ matrix.environment }}\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: {{nodeVersion}}\n          cache: '{{packageManager}}'\n      - run: {{installCommand}}\n      - run: {{buildCommand}}\n      - name: Deploy to ${{ matrix.environment }}\n        run: |\n          echo \"Deploying to ${{ matrix.environment }}\"\n          npm run deploy -- --environment=${{ matrix.environment }}\n        env:\n          DEPLOYMENT_TOKEN: ${{ secrets[format('{0}_DEPLOYMENT_TOKEN', matrix.environment | upper)] }}\n";

/**
 * Node.js Dockerfile - for standard Node.js applications
 * Multi-stage build for optimized image size
 */
const DOCKERFILE_NODE_TEMPLATE =
  '# Build stage\nFROM node:{{nodeVersion}}-alpine AS builder\n\nWORKDIR /app\n\nCOPY package.json {{packageManager}}-lock.yaml ./\nRUN {{installCommand}}\n\nCOPY . .\nRUN {{buildCommand}}\n\n# Runtime stage\nFROM node:{{nodeVersion}}-alpine\n\nWORKDIR /app\n\n# Install dumb-init for proper signal handling\nRUN apk add --no-cache dumb-init\n\n# Create non-root user\nRUN addgroup -g 1001 -S nodejs && \\\n    adduser -S nodejs -u 1001\n\nCOPY package.json {{packageManager}}-lock.yaml ./\nRUN {{installCommand}} --omit=dev && \\\n    npm cache clean --force\n\nCOPY --from=builder /app/dist ./dist\n\nUSER nodejs\n\nEXPOSE 3000\n\nHEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \\\n  CMD node -e "require(\'http\').get(\'http://localhost:3000/health\', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"\n\nENTRYPOINT ["dumb-init", "--"]\nCMD ["node", "dist/index.js"]\n';

/**
 * Next.js Dockerfile - optimized for Next.js framework
 * Includes standalone mode for reduced image size
 */
const DOCKERFILE_NEXTJS_TEMPLATE =
  '# Build stage\nFROM node:{{nodeVersion}}-alpine AS builder\n\nWORKDIR /app\n\nCOPY package.json {{packageManager}}-lock.yaml ./\nRUN {{installCommand}}\n\nCOPY . .\nRUN {{buildCommand}}\n\n# Runtime stage\nFROM node:{{nodeVersion}}-alpine\n\nWORKDIR /app\n\n# Install dumb-init for proper signal handling\nRUN apk add --no-cache dumb-init\n\n# Create non-root user\nRUN addgroup -g 1001 -S nodejs && \\\n    adduser -S nodejs -u 1001\n\n# Copy runtime dependencies\nCOPY --from=builder /app/node_modules ./node_modules\nCOPY --from=builder /app/package.json ./package.json\nCOPY --from=builder /app/.next ./.next\nCOPY --from=builder /app/public ./public\n\nUSER nodejs\n\nEXPOSE 3000\n\nHEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \\\n  CMD node -e "require(\'http\').get(\'http://localhost:3000/api/health\', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"\n\nENTRYPOINT ["dumb-init", "--"]\nCMD ["npm", "start"]\n';

/**
 * docker-compose.yml template - for local development and multi-container setups
 */
const DOCKER_COMPOSE_TEMPLATE =
  'version: \'3.8\'\n\nservices:\n  app:\n    build:\n      context: .\n      dockerfile: Dockerfile\n    ports:\n      - "${PORT:-3000}:3000"\n    environment:\n      NODE_ENV: ${NODE_ENV:-development}\n      DEBUG: ${DEBUG:-false}\n    volumes:\n      - .:/app\n      - /app/node_modules\n      - /app/.next\n    depends_on:\n      - redis\n    restart: unless-stopped\n\n  redis:\n    image: redis:7-alpine\n    ports:\n      - "${REDIS_PORT:-6379}:6379"\n    volumes:\n      - redis_data:/data\n    restart: unless-stopped\n    healthcheck:\n      test: ["CMD", "redis-cli", "ping"]\n      interval: 10s\n      timeout: 3s\n      retries: 3\n\nvolumes:\n  redis_data:\n\nnetworks:\n  default:\n    name: app_network\n';

/**
 * .dockerignore template - excludes unnecessary files from Docker build context
 */
const DOCKERIGNORE_TEMPLATE =
  'node_modules\nnpm-debug.log\ndist\nbuild\ncoverage\n.git\n.gitignore\n.env.local\n.env.*.local\n*.log\n.DS_Store\n.vscode\n.idea\n*.swp\n*.swo\nMakefile\nREADME.md\nLICENSE\n.prettierignore\n.eslintignore\n.eslintrc*\n.prettierrc*\njest.config.*\ntsconfig.json\ncommitlint.config.js\n.husky\n.devforge\n.next/cache\n.turbo\n';

/**
 * Template registry - maps template IDs to template strings
 * IMPORTANT: These IDs must match AVAILABLE_TEMPLATES in src/engine/ruleEngine.ts
 */
export const TEMPLATES: Record<string, string> = {
  'base-ci': BASE_CI_TEMPLATE,
  'vercel-deploy': VERCEL_DEPLOY_TEMPLATE,
  'railway-deploy': RAILWAY_DEPLOY_TEMPLATE,
  'render-deploy': RENDER_DEPLOY_TEMPLATE,
  'aws-ec2-deploy': AWS_EC2_DEPLOY_TEMPLATE,
  'docker-build': DOCKER_BUILD_TEMPLATE,
  'docker-compose': DOCKER_COMPOSE_TEMPLATE,
  'dockerfile-node': DOCKERFILE_NODE_TEMPLATE,
  'dockerfile-nextjs': DOCKERFILE_NEXTJS_TEMPLATE,
  dockerignore: DOCKERIGNORE_TEMPLATE,
  'multi-env-deploy': MULTI_ENV_DEPLOY_TEMPLATE,
};

/**
 * Template validation schema - ensures template structure is correct
 */
export const TemplateRegistrySchema = z.object({
  'base-ci': z.string().min(1),
  'vercel-deploy': z.string().min(1),
  'railway-deploy': z.string().min(1),
  'render-deploy': z.string().min(1),
  'aws-ec2-deploy': z.string().min(1),
  'docker-build': z.string().min(1),
  'docker-compose': z.string().min(1),
  'dockerfile-node': z.string().min(1),
  'dockerfile-nextjs': z.string().min(1),
  dockerignore: z.string().min(1),
  'multi-env-deploy': z.string().min(1),
});

export type TemplateRegistry = z.infer<typeof TemplateRegistrySchema>;

/**
 * Get a template by ID
 * @throws {Error} if template ID not found
 */
export function getTemplate(templateId: string): string {
  const template = TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }
  return template;
}

/**
 * Get all available template IDs
 */
export function getAvailableTemplateIds(): string[] {
  return Object.keys(TEMPLATES);
}

/**
 * Validate that all templates are properly defined
 * Used for compile-time checking
 */
export function validateTemplateRegistry(): boolean {
  const result = TemplateRegistrySchema.safeParse(TEMPLATES);
  return result.success;
}

/**
 * Check if a template contains sensitive patterns that should not appear in templates
 * Returns array of warning strings if issues found
 * @internal Only used for security validation
 */
export function checkTemplateSecurityIssues(): string[] {
  const warnings: string[] = [];
  const suspiciousPatterns = [
    { pattern: /['"][a-zA-Z0-9]{20,}['"]/g, name: 'potential hardcoded token' },
    { pattern: /password\s*=\s*['"][^'"]+['"]/gi, name: 'hardcoded password' },
    { pattern: /api.?key\s*=\s*['"][^'"]+['"]/gi, name: 'hardcoded API key' },
    { pattern: /private.?key|BEGIN RSA PRIVATE|BEGIN PRIVATE/gi, name: 'private key' },
    { pattern: /authorization:\s*['"]Bearer [^'"]{20,}['"]/gi, name: 'hardcoded auth token' },
  ];

  for (const [templateId, templateContent] of Object.entries(TEMPLATES)) {
    for (const { pattern, name } of suspiciousPatterns) {
      if (pattern.test(templateContent)) {
        warnings.push(`${templateId}: Contains ${name}`);
      }
    }
  }

  return warnings;
}

// Validate at module load time
const validationResult = validateTemplateRegistry();
if (!validationResult) {
  throw new Error('Template registry validation failed');
}
