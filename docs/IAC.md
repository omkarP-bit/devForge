# DevForge IaC Integration

DevForge automates Infrastructure-as-Code for your CI/CD pipelines. It detects existing IaC, executes it when ready, or generates it from scratch using an LLM-assisted loop backed by verified building-block templates.

---

## Detecting existing IaC

DevForge scans your project root for known IaC patterns before prompting for any configuration. Detection is performed by the `IaCDetector` and considers:

| Signal | Detected tool |
|--------|--------------|
| `*.tf` files or `.terraform/` directory | Terraform |
| `cdk.json` or `cdk.out/` | AWS CDK |
| `deploy.py` importing `boto3` | boto3 |
| `Pulumi.yaml` | Pulumi |
| `playbook.yml` / `ansible.cfg` | Ansible |

The result is an `IaCDetectionResult`:

```ts
{
  detected: boolean;
  tool: 'terraform' | 'cdk' | 'boto3' | 'pulumi' | 'ansible' | null;
  entryPoints: string[];   // e.g. ["infra/main.tf"]
  isDeployReady: boolean;  // true when lock files / synth output present
  configDir: string | null;
}
```

`isDeployReady` is `true` only when the IaC has been initialised (e.g. `.terraform.lock.hcl` exists for Terraform, `cdk.out/` exists for CDK).

---

## Automated execution (IaC ready)

When `detected=true` and `isDeployReady=true`, DevForge delegates to `IaCExecutor` which runs the tool natively:

| Tool | Commands run |
|------|-------------|
| Terraform | `terraform plan` → human approval → `terraform apply` |
| CDK | `cdk diff` → human approval → `cdk deploy --all` |
| boto3 | `python deploy.py --dry-run` → human approval → `python deploy.py` |

The approval step is skipped when `--yes` is passed (CI-safe) or `autoApprove: true` is set in state.

---

## IaC generation (IaC not present)

When `detected=false` (or `isDeployReady=false`), DevForge offers to generate IaC. The user is prompted:

```
Which IaC tool do you want DevForge to generate?
  ● Terraform (recommended for AWS)
  ○ AWS CDK (TypeScript)
  ○ boto3 (Python)
  ○ Skip IaC generation
```

This prompt appears only for deployment targets that require IaC (AWS ECS, EKS, EC2, Docker). Managed platforms (Vercel, Railway, Render, Firebase) skip it entirely.

### Generation loop

```
START
  │
  ▼
iac_generate  ←─────────────────────────────────────────┐
  │ IaCGenerationAgent assembles files from              │
  │ template library + LLM parameter fill-in            │
  ▼                                                      │
iac_verify                                               │
  │ IaCVerifier runs tool-native validation              │
  ├── passed=true  ──→  iac_write  ──→  END             │
  │                                                      │
  └── passed=false ──→  attempt < max?  ──→  yes ───────┘
                              │
                             no
                              │
                              ▼
                         END (no files written, errors printed)
```

Progress is printed to stdout:

```
⟳ Generating Terraform configuration (attempt 1/2)...
✗ Verification failed: invalid resource reference in main.tf
⟳ Regenerating with error context (attempt 2/2)...
✓ Terraform configuration verified successfully
✓ Generated 4 IaC files:
  infra/provider.tf
  infra/variables.tf
  infra/main.tf
  infra/outputs.tf
```

---

## Supported IaC tools and deployment targets

| Deployment target | Terraform | CDK | boto3 | IaC needed? |
|-------------------|-----------|-----|-------|-------------|
| AWS ECS (Fargate) | ✓ | ✓ | ✓ | Yes |
| AWS EKS | ✓ | — | — | Yes |
| AWS EC2 | ✓ | — | ✓ | Yes |
| Docker (generic) | ✓ | — | — | Yes |
| Vercel | — | — | — | No |
| Railway | — | — | — | No |
| Render | — | — | — | No |
| Firebase | — | — | — | No |

---

## Verification steps per tool

### Terraform

1. Write `.tf` files to an isolated temp directory
2. `terraform init -backend=false -input=false` — validates provider config without cloud credentials
3. `terraform validate` — checks HCL syntax and resource references
4. `terraform fmt -check -recursive` — format check only (never auto-formats without user knowledge)

Timeout: 60 seconds per step.

### AWS CDK

1. Write CDK files to temp directory
2. `npm install --prefer-offline --no-audit` (if `package.json` is present)
3. `npx cdk synth --quiet` — synthesises CloudFormation templates

Timeout: 120 seconds.

### boto3

1. Write `.py` files to temp directory
2. `python -m py_compile <file>` — syntax validation for each Python file
3. `pylint --errors-only <file>` — optional, skipped gracefully if pylint is not installed

Timeout: 30 seconds.

---

## Trivy scanning of IaC configurations

When Trivy is available, generated IaC files are scanned for misconfigurations before being written to disk. Trivy findings are surfaced as warnings — they never block generation. See [SECURITY.md](./SECURITY.md) for details.

---

## Manual steps after generation

DevForge cannot perform these steps automatically:

- **Configure AWS credentials** (`aws configure` or set `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`)
- **Terraform state backend** — the generated `provider.tf` uses local state; configure S3 remote state for teams
- **CDK bootstrap** — run `cdk bootstrap aws://<account>/<region>` once per account/region before deploying
- **IAM permissions** — the deploying identity needs permissions to create ECR, ECS, EKS, and IAM resources
- **VPC / networking** — generated IaC uses default VPC; update `main.tf` / CDK stacks for custom networking

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEVFORGE_IAC_MAX_RETRY` | `2` | Maximum generation + verification attempts before giving up |
| `DEVFORGE_USE_LANGGRAPH` | enabled | Set to `false` to disable LangGraph (skips IaC generation) |
