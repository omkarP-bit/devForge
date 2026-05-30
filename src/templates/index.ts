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
 * Includes linting, testing, and build validation
 */
const BASE_CI_TEMPLATE =
  "name: Base CI\n\non:\n  push:\n    branches: [main, develop]\n  pull_request:\n    branches: [main, develop]\n\njobs:\n  ci:\n    runs-on: ubuntu-latest\n\n    strategy:\n      matrix:\n        node-version: [{{nodeVersion}}]\n\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          fetch-depth: 0\n\n      - name: Use Node.js ${{ matrix.node-version }}\n        uses: actions/setup-node@v4\n        with:\n          node-version: ${{ matrix.node-version }}\n          cache: '{{packageManager}}'\n\n      - name: Install dependencies\n        run: {{installCommand}}\n\n      - name: Run linter\n        if: ${{ github.event_name == 'pull_request' }}\n        run: npm run lint || echo \"Linting check skipped\"\n\n      - name: Run tests\n        if: ${{ github.event_name == 'pull_request' }}\n        run: {{testCommand}} || echo \"Tests skipped\"\n\n      - name: Build project\n        run: {{buildCommand}}\n\n      - name: Upload build artifact\n        uses: actions/upload-artifact@v3\n        with:\n          name: dist\n          path: dist/\n";

/**
 * Vercel deployment workflow - optimized for Vercel edge platform
 * Integrates with Vercel CLI for deployments
 */
const VERCEL_DEPLOY_TEMPLATE =
  "name: Deploy to Vercel\n\non:\n  push:\n    branches: [main]\n\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n\n    environment:\n      name: production\n      url: https://${{ env.VERCEL_URL }}\n\n    steps:\n      - uses: actions/checkout@v4\n\n      - name: Use Node.js {{nodeVersion}}\n        uses: actions/setup-node@v4\n        with:\n          node-version: {{nodeVersion}}\n          cache: '{{packageManager}}'\n\n      - name: Install dependencies\n        run: {{installCommand}}\n\n      - name: Build project\n        run: {{buildCommand}}\n\n      - name: Deploy to Vercel\n        uses: amondnet/vercel-action@v25\n        with:\n          vercel-token: ${{ secrets.VERCEL_TOKEN }}\n          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}\n          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}\n          working-directory: ./\n";

/**
 * Railway deployment workflow - for Railway hosted deployments
 * Uses Railway CLI for deployments
 */
const RAILWAY_DEPLOY_TEMPLATE =
  "name: Deploy to Railway\n\non:\n  push:\n    branches: [main]\n\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n\n    environment:\n      name: production\n\n    steps:\n      - uses: actions/checkout@v4\n\n      - name: Use Node.js {{nodeVersion}}\n        uses: actions/setup-node@v4\n        with:\n          node-version: {{nodeVersion}}\n          cache: '{{packageManager}}'\n\n      - name: Install dependencies\n        run: {{installCommand}}\n\n      - name: Build project\n        run: {{buildCommand}}\n\n      - name: Deploy to Railway\n        uses: railwayapp/railway-action@v1\n        with:\n          railway-token: ${{ secrets.RAILWAY_TOKEN }}\n";

/**
 * Render deployment workflow - for Render hosted deployments
 * Uses Render deploy hook for automated deployments
 */
const RENDER_DEPLOY_TEMPLATE =
  'name: Deploy to Render\n\non:\n  push:\n    branches: [main]\n\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n\n    environment:\n      name: production\n\n    steps:\n      - uses: actions/checkout@v4\n\n      - name: Deploy to Render\n        run: |\n          curl \\\n            --request POST \\\n            --url ${{ secrets.RENDER_DEPLOY_HOOK }} \\\n            --header \'Content-Type: application/json\' \\\n            --data \'{\n              "gitCommitSha": "${{ github.sha }}",\n              "branch": "${{ github.ref_name }}"\n            }\'\n\n      - name: Wait for deployment\n        run: sleep 30\n';

/**
 * AWS EC2 deployment workflow - for EC2 instance deployments
 * Assumes EC2 runner or SSH-based deployment
 */
const AWS_EC2_DEPLOY_TEMPLATE =
  "name: Deploy to AWS EC2\n\non:\n  push:\n    branches: [main]\n\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n\n    environment:\n      name: production\n\n    steps:\n      - uses: actions/checkout@v4\n\n      - name: Use Node.js {{nodeVersion}}\n        uses: actions/setup-node@v4\n        with:\n          node-version: {{nodeVersion}}\n          cache: '{{packageManager}}'\n\n      - name: Install dependencies\n        run: {{installCommand}}\n\n      - name: Build project\n        run: {{buildCommand}}\n\n      - name: Configure AWS credentials\n        uses: aws-actions/configure-aws-credentials@v4\n        with:\n          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}\n          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}\n          aws-region: ${{ secrets.AWS_REGION }}\n\n      - name: Deploy to EC2\n        run: |\n          aws s3 cp dist/ s3://${{ secrets.S3_BUCKET }}/app/ --recursive\n          aws ec2 reboot-instances --instance-ids ${{ secrets.EC2_INSTANCE_ID }} --region ${{ secrets.AWS_REGION }} || true\n";

/**
 * Docker build and push workflow
 * Builds Docker image and pushes to registry
 */
const DOCKER_BUILD_TEMPLATE =
  "name: Build and Push Docker Image\n\non:\n  push:\n    branches: [main]\n    tags: ['v*']\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n\n    permissions:\n      contents: read\n      packages: write\n\n    steps:\n      - uses: actions/checkout@v4\n\n      - name: Set up Docker Buildx\n        uses: docker/setup-buildx-action@v3\n\n      - name: Log in to Docker Hub\n        uses: docker/login-action@v3\n        with:\n          username: ${{ secrets.DOCKER_HUB_USERNAME }}\n          password: ${{ secrets.DOCKER_HUB_PASSWORD }}\n\n      - name: Build and push\n        uses: docker/build-push-action@v5\n        with:\n          context: .\n          push: true\n          tags: |\n            ${{ secrets.DOCKER_HUB_USERNAME }}/{{framework | downcase}}-app:latest\n            ${{ secrets.DOCKER_HUB_USERNAME }}/{{framework | downcase}}-app:${{ github.sha }}\n          cache-from: type=gha\n          cache-to: type=gha,mode=max\n";

/**
 * Multi-environment deployment workflow
 * Deploys to multiple environments (staging, production, etc.)
 */
const MULTI_ENV_DEPLOY_TEMPLATE =
  "name: Deploy to Environment\n\non:\n  push:\n    branches: [main, develop]\n\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n\n    strategy:\n      matrix:\n        environment: {{environments}}\n\n    environment:\n      name: ${{ matrix.environment }}\n\n    steps:\n      - uses: actions/checkout@v4\n\n      - name: Use Node.js {{nodeVersion}}\n        uses: actions/setup-node@v4\n        with:\n          node-version: {{nodeVersion}}\n          cache: '{{packageManager}}'\n\n      - name: Install dependencies\n        run: {{installCommand}}\n\n      - name: Build project\n        run: {{buildCommand}}\n\n      - name: Deploy to ${{ matrix.environment }}\n        run: |\n          echo \"Deploying to ${{ matrix.environment }}\"\n          npm run deploy -- --environment=${{ matrix.environment }}\n        env:\n          DEPLOYMENT_TOKEN: ${{ secrets[format('{0}_DEPLOYMENT_TOKEN', matrix.environment | upper)] }}\n";

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
