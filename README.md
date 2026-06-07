# DevForge

[![npm version](https://img.shields.io/npm/v/devforge.svg)](https://www.npmjs.com/package/devforge)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![ci](https://img.shields.io/github/actions/workflow/status/OWNER/REPO/ci.yml?branch=main)](.github/workflows/ci.yml)
[![release](https://img.shields.io/github/actions/workflow/status/OWNER/REPO/release.yml?branch=main)](.github/workflows/release.yml)

Production-ready CI/CD pipelines in one command. No AI. No cloud. No config.

For command details, see [docs/COMMANDS.md](docs/COMMANDS.md).

## Problem

- New projects spend too long recreating the same CI/CD setup by hand.
- Generic generators ignore the real project structure, so the first draft is rarely usable.
- Teams need deterministic output they can review, diff, and commit with confidence.

## Quick Start

1. Run `npx devforge init`.
2. DevForge detects your framework, package manager, and deployment target.
3. Review the detected configuration and choose your deployment options.
4. Preview the generated workflows if you want a before/after diff.
5. Generate the files and commit them to your repository.

## Features

| Feature | DevForge | Yeoman | Workik AI | Actions Importer |
| --- | --- | --- | --- | --- |
| Local project detection | Yes | Limited | No | No |
| One command setup | Yes | Yes | Yes | No |
| Deployment provider support | Yes | Via generators | Partial | Limited |
| Docker generation | Yes | Via generators | Yes | No |
| Secret guidance | Yes | No | Partial | No |
| Works offline | Yes | Yes | No | No |
| Dry run mode | Yes | Depends | Partial | No |
| Update command | Yes | No | No | No |
| Audit mode | Yes | No | No | No |
| IaC detection (Terraform, CDK, boto3, Pulumi, Ansible) | Yes | No | No | No |
| Automated deployment via detected IaC | Yes | No | No | No |
| LLM-assisted IaC generation with verification loop | Yes | No | Partial | No |

## Supported Frameworks

[![React](https://img.shields.io/badge/React-supported-61dafb)](#)
[![Next.js](https://img.shields.io/badge/Next.js-supported-black)](#)
[![Express](https://img.shields.io/badge/Express-supported-lightgrey)](#)
[![NestJS](https://img.shields.io/badge/NestJS-supported-ea285f)](#)
[![Vue](https://img.shields.io/badge/Vue-supported-42b883)](#)
[![Angular](https://img.shields.io/badge/Angular-supported-dd0031)](#)

## Supported Deployment Targets

| Target | IaC automation | Supported tools |
|--------|---------------|----------------|
| Vercel | Not needed (managed) | — |
| Railway | Not needed (managed) | — |
| Render | Not needed (managed) | — |
| Firebase | Not needed (managed) | — |
| AWS ECS (Fargate) | ✓ generate + execute | Terraform, CDK, boto3 |
| AWS EKS | ✓ generate + execute | Terraform |
| AWS EC2 | ✓ generate + execute | Terraform, boto3 |
| Docker | ✓ generate + execute | Terraform |

## Commands

`init` is the primary entry point. It detects the project, collects deployment preferences, optionally previews the output, and writes the generated workflows plus secrets guidance into `.devforge/`.

`update` refreshes existing DevForge-managed workflows against the latest templates. It shows a diff, preserves custom sections, and only applies changes after confirmation.

`audit` scans any GitHub Actions workflow set for security, performance, and best-practice issues. It prints a per-file report and exits non-zero when high-severity findings exist.

`preview` renders the planned output in memory so you can inspect the exact YAML before anything is written to disk.

## IaC Automation

DevForge detects existing IaC and, when none is present, can generate it:

- ✦ IaC detection (Terraform, CDK, boto3, Pulumi, Ansible)
- ✦ Automated deployment via detected IaC (with human-in-the-loop confirmation)
- ✦ LLM-assisted IaC generation — files assembled from verified building-block templates
- ✦ Verification loop: `terraform validate`, `cdk synth`, `python -m py_compile` before writing any file
- ✦ Retry loop: up to `DEVFORGE_IAC_MAX_RETRY` attempts (default 2), with error context fed back to the LLM
- ✦ Trivy IaC misconfiguration scanning on generated configs

See [docs/IAC.md](docs/IAC.md) for full details.

## Security

DevForge is designed to stay deterministic and reviewable:

- No remote model calls are required for generation.
- Templates are static and rendered through a strict variable allowlist.
- File writes use guarded paths and atomic operations.
- Secrets are reported as guidance, not injected into source files.
- The published package is hardened for release with a strict file allowlist and prepublish checks.

## Docs

See [docs/COMMANDS.md](docs/COMMANDS.md) for the full command reference, [docs/SECURITY.md](docs/SECURITY.md) for the user-facing security model, and [docs/IAC.md](docs/IAC.md) for IaC detection, generation, and verification.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Licensed under the MIT License. See [LICENSE](LICENSE).
