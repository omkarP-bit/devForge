/**
 * Secrets Analyzer Module
 *
 * Extracts secrets from rendered CI/CD files and generates SECRETS_REQUIRED.md
 * documentation with setup instructions for each secret.
 *
 * Design Principles:
 * - Regex-based extraction from all rendered file content
 * - Registry of known secrets with metadata
 * - Deduplication and cross-reference tracking
 * - Production-ready GitHub Actions integration steps
 */

/**
 * Information about a required secret
 */
export interface SecretInfo {
  name: string;
  usedIn: string[];
  description: string;
  howToObtain: string;
  githubSettingsPath: string;
}

/**
 * Rendered file with path and content
 */
export interface RenderedFile {
  path: string;
  content: string;
}

/**
 * Metadata for a known secret
 */
interface KnownSecret {
  description: string;
  howToObtain: string;
  githubSettingsPath?: string;
}

/**
 * Registry of known secrets with their metadata
 * Maps secret name to description and how to obtain it
 */
const KNOWN_SECRETS: Record<string, KnownSecret> = {
  VERCEL_TOKEN: {
    description: 'Vercel deploy authentication token',
    howToObtain:
      'Visit vercel.com → Settings → Tokens → Create a new token (Full Access or Production)',
    githubSettingsPath: 'Settings → Secrets and variables → Actions → New repository secret',
  },
  VERCEL_ORG_ID: {
    description: 'Your Vercel team/organization ID',
    howToObtain:
      'Found in vercel.com → Settings → General → Team ID (if using team) or use account slug',
    githubSettingsPath: 'Settings → Secrets and variables → Actions → New repository secret',
  },
  VERCEL_PROJECT_ID: {
    description: 'Your Vercel project ID',
    howToObtain:
      'Found in your Vercel project → Settings → General → Project ID, or in .vercel/project.json',
    githubSettingsPath: 'Settings → Secrets and variables → Actions → New repository secret',
  },
  RAILWAY_TOKEN: {
    description: 'Railway platform authentication token',
    howToObtain: 'Visit railway.app → Account → Tokens → Create a new token with full access',
    githubSettingsPath: 'Settings → Secrets and variables → Actions → New repository secret',
  },
  RENDER_DEPLOY_HOOK: {
    description: 'Render deployment webhook URL for triggering deployments from GitHub',
    howToObtain:
      'In Render dashboard → Select service → Settings → Deploy Hook → Copy the provided URL',
    githubSettingsPath: 'Settings → Secrets and variables → Actions → New repository secret',
  },
  AWS_EC2_HOST: {
    description: 'Public IP address or hostname of your AWS EC2 instance',
    howToObtain:
      'AWS Console → EC2 → Instances → Select your instance → Copy Public IPv4 address or DNS name',
    githubSettingsPath: 'Settings → Secrets and variables → Actions → New repository secret',
  },
  AWS_EC2_USERNAME: {
    description: 'SSH username for EC2 instance access',
    howToObtain:
      'Default is "ubuntu" for Ubuntu AMIs, "ec2-user" for Amazon Linux, "admin" for Debian',
    githubSettingsPath: 'Settings → Secrets and variables → Actions → New repository secret',
  },
  AWS_EC2_SSH_KEY: {
    description: 'Private SSH key for EC2 access (entire PEM file contents)',
    howToObtain:
      'Downloaded during EC2 key pair creation (.pem file). KEEP SECURE. Never commit to git.',
    githubSettingsPath: 'Settings → Secrets and variables → Actions → New repository secret',
  },
  DOCKER_USERNAME: {
    description: 'Docker Hub username for registry authentication',
    howToObtain:
      'Your Docker Hub account username. Visit hub.docker.com and log in to verify your username.',
    githubSettingsPath: 'Settings → Secrets and variables → Actions → New repository secret',
  },
  DOCKER_PASSWORD: {
    description: 'Docker Hub access token (NOT your account password)',
    howToObtain:
      'Visit hub.docker.com → Account Settings → Security → Create access token with read/write access',
    githubSettingsPath: 'Settings → Secrets and variables → Actions → New repository secret',
  },
  NPM_TOKEN: {
    description: 'npm registry authentication token for publishing packages',
    howToObtain:
      'Visit npmjs.com → Your profile → Settings → Auth Tokens → Create a new Classic token',
    githubSettingsPath: 'Settings → Secrets and variables → Actions → New repository secret',
  },
  GITHUB_TOKEN: {
    description: 'GitHub Personal Access Token for API access (usually auto-provided by GitHub)',
    howToObtain:
      'Visit github.com → Settings → Developer settings → Personal access tokens → Create new token',
    githubSettingsPath: 'Settings → Secrets and variables → Actions → New repository secret',
  },
};

/**
 * Regex to extract secret names from GitHub Actions syntax
 * Matches: ${{ secrets.SECRET_NAME }}
 */
const SECRETS_REGEX = /\$\{\{\s*secrets\.([A-Z_][A-Z0-9_]*)\s*\}\}/g;

/**
 * Extracts all unique secrets from rendered files
 *
 * @param renderedFiles - Array of generated files with content
 * @returns Array of SecretInfo objects, deduplicated
 */
export function extractSecrets(renderedFiles: RenderedFile[]): SecretInfo[] {
  const secretsMap = new Map<string, SecretInfo>();

  for (const file of renderedFiles) {
    const matches = file.content.matchAll(SECRETS_REGEX);

    // Detect environment from filename pattern .github/workflows/deploy-<env>.yml
    let envLabel = '';
    const mEnv = file.path.match(/\.github\/workflows\/deploy-([a-zA-Z0-9_-]+)\.ya?ml$/i);
    if (mEnv && mEnv[1]) {
      envLabel = mEnv[1];
    }

    for (const match of matches) {
      const secretName = match[1];

      if (!secretName) {
        continue;
      }

      if (!secretsMap.has(secretName)) {
        // Look up in known secrets registry
        // eslint-disable-next-line security/detect-object-injection
        const knownSecret = KNOWN_SECRETS[secretName];

        if (knownSecret) {
          const usedInEntries = [file.path];
          // Only add env-labeled entry if the path does not already mention the env
          if (envLabel && !file.path.toLowerCase().includes(envLabel.toLowerCase())) {
            usedInEntries.push(`${file.path} (env:${envLabel})`);
          }
          secretsMap.set(secretName, {
            name: secretName,
            usedIn: usedInEntries,
            description: knownSecret.description,
            howToObtain: knownSecret.howToObtain,
            githubSettingsPath:
              knownSecret.githubSettingsPath ||
              'Settings → Secrets and variables → Actions → New repository secret',
          });
        } else {
          // Unknown secret - provide generic guidance
          secretsMap.set(secretName, {
            name: secretName,
            usedIn: [file.path],
            description: 'Custom secret',
            howToObtain: 'Provide this value manually based on your deployment requirements',
            githubSettingsPath:
              'Settings → Secrets and variables → Actions → New repository secret',
          });
        }
      } else {
        // Add file reference if not already present
        const existing = secretsMap.get(secretName)!;
        // Add both plain path and env-labeled entry (if env present) to preserve compatibility
        if (!existing.usedIn.includes(file.path)) {
          existing.usedIn.push(file.path);
        }
        if (envLabel && !file.path.toLowerCase().includes(envLabel.toLowerCase())) {
          const envEntry = `${file.path} (env:${envLabel})`;
          if (!existing.usedIn.includes(envEntry)) {
            existing.usedIn.push(envEntry);
          }
        }
      }
    }
  }

  // Return sorted by secret name
  return Array.from(secretsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Generates complete SECRETS_REQUIRED.md documentation
 *
 * @param secrets - Array of SecretInfo objects
 * @returns Complete Markdown string for SECRETS_REQUIRED.md
 */
export function generateSecretsDoc(secrets: SecretInfo[]): string {
  if (secrets.length === 0) {
    return `# SECRETS_REQUIRED.md

No secrets required for this configuration.
`;
  }

  const lines: string[] = [];

  // Header
  lines.push('# SECRETS_REQUIRED.md');
  lines.push('');
  lines.push(
    `This document lists all ${secrets.length} secret(s) required for your DevForge CI/CD pipelines.`,
  );
  lines.push('');
  lines.push('## Adding Secrets to GitHub');
  lines.push('');
  lines.push('For each secret below:');
  lines.push('1. Visit your repository on github.com');
  lines.push('2. Go to **Settings → Secrets and variables → Actions**');
  lines.push('3. Click **New repository secret**');
  lines.push('4. Enter the secret name and value');
  lines.push('5. Click **Add secret**');
  lines.push('');
  lines.push('---');
  lines.push('');

  // Secrets details
  for (const secret of secrets) {
    lines.push(`## ${secret.name}`);
    lines.push('');
    lines.push(`**Description:** ${secret.description}`);
    lines.push('');
    lines.push(`**Used in:** ${secret.usedIn.join(', ')}`);
    lines.push('');
    lines.push('**How to obtain:**');
    lines.push('');
    lines.push(`> ${secret.howToObtain}`);
    lines.push('');
    lines.push('**Setup steps:**');
    lines.push('');
    lines.push('1. Obtain the secret value using instructions above');
    lines.push('2. Go to your GitHub repository');
    lines.push(`3. Navigate to: ${secret.githubSettingsPath}`);
    lines.push(`4. Enter \`${secret.name}\` as the secret name`);
    lines.push('5. Paste the value and click **Add secret**');
    lines.push('');
  }

  // Checklist
  lines.push('---');
  lines.push('');
  lines.push('## Setup Checklist');
  lines.push('');
  for (const secret of secrets) {
    lines.push(`- [ ] \`${secret.name}\` added to GitHub Secrets`);
  }
  lines.push('');
  lines.push(
    'Once all secrets are added, your CI/CD pipelines will have access to them via `${{ secrets.SECRET_NAME }}`.',
  );
  lines.push('');

  return lines.join('\n');
}

/**
 * Get the list of all known secret names
 *
 * @returns Array of known secret names
 */
export function getKnownSecretNames(): string[] {
  return Object.keys(KNOWN_SECRETS).sort();
}
