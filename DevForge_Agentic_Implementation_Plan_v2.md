# DevForge — Agentic AI Edition: 6-Phase Implementation Plan (v2)

> **Project:** DevForge — AI-Powered Agentic CI/CD Pipeline Generator and Deployment Automation Tool
> **Total Duration:** 6 Weeks
> **Architecture Goals:** Agentic AI-first, multi-LLM provider support, offline fallback, security-hardened, extensible agent framework
> **Package Type:** npm CLI (`npx devforge`)
> **Version:** v2 — Agentic Edition (builds on top of the completed v1 core)

---

## What Changed from v1

The v1 DevForge core (Phases 1–6 of the original plan) is complete and shipped as a stable npm package. v2 layers an **agentic AI brain** on top of that deterministic core. The template engine and rule engine remain unchanged — agents augment, never replace, the security-hardened generation pipeline.

Key additions from the notebook spec:
- **LLM Provider Selection** — Amazon Nova Pro (default), Google Gemini, OpenAI, Anthropic, Amazon Bedrock; asked once at first `devforge init`, stored locally
- **Memory Storage** — Amazon Elastic for agent memory
- **Cache System** — Persistent LLM response caching to avoid redundant API calls
- **Security & Compliance Agents** — Detect misconfiguration using US NIST and ISO standards, invoked as background agents post-generation
- **Recommendation Agents** — Triggered automatically on `npx devforge init`; recommend updates on pipeline fails; tell expected outputs on pipeline changes
- **Extended Deployment Support** — Amazon EKS, Amazon ECS
- **Extended Framework Support** — FastAPI, Django, Flask (Python-based frameworks)

---

## Phase Structure Overview

| Phase | Focus | Week |
|---|---|---|
| Phase 1 | Agentic Foundation — LLM Provider Setup & Agent Runtime | Week 1 |
| Phase 2 | Recommendation Agent & LLM-Enhanced Init Flow | Week 2 |
| Phase 3 | Security & Compliance Agent System | Week 3 |
| Phase 4 | Python Framework Support & Extended Detection | Week 4 |
| Phase 5 | Extended Deployment Targets (EKS, ECS) & Memory System | Week 5 |
| Phase 6 | Jenkins Integration, Automated Pipeline Execution & npm Release | Week 6 |

---

---

## Phase 1 — Agentic Foundation: LLM Provider Setup & Agent Runtime

**Duration:** Week 1
**Goal:** Build the foundational agent runtime that all future phases depend on. This includes the multi-LLM provider abstraction, credential management (stored locally, asked only once), the offline fallback mode that delegates back to the v1 template engine, and the base agent class that all specialized agents will extend.

**Why this first:** Every agentic feature — recommendations, compliance scanning, memory — runs through the LLM provider. Getting the provider layer right before building agents prevents a costly rewrite later. Offline-first is non-negotiable: users without internet or API keys must still get v1-quality output.

---

### Task 1.1 — Multi-LLM Provider Abstraction Layer

**Description:**
Build a unified `LLMProvider` interface that wraps Amazon Nova Pro, Google Gemini, OpenAI, Anthropic, and Amazon Bedrock behind a single `chat(prompt: string): Promise<string>` API. Each provider is implemented as an independent adapter. The active provider is resolved at runtime from the locally stored config. Credentials are never hardcoded — they come from the local DevForge credential store.

**Implementation Prompt:**
```
You are extending DevForge, a TypeScript CLI tool, with multi-LLM provider support.

Task: Create src/agent/providers/ — a multi-provider LLM abstraction layer.

Requirements:
1. Define interface LLMProvider in src/agent/providers/types.ts:
   interface LLMProvider {
     name: string;
     chat(messages: AgentMessage[], options?: ChatOptions): Promise<string>;
     isAvailable(): Promise<boolean>; // tests credentials without throwing
   }

   interface AgentMessage { role: 'user' | 'assistant' | 'system'; content: string; }
   interface ChatOptions { maxTokens?: number; temperature?: number; systemPrompt?: string; }

2. Implement these five adapters, each in its own file:
   - src/agent/providers/NovaPro.ts — Amazon Bedrock Nova Pro (default)
     Uses @aws-sdk/client-bedrock-runtime, model: amazon.nova-pro-v1:0
   - src/agent/providers/Gemini.ts — Google Gemini 1.5 Flash
     Uses @google/generative-ai SDK
   - src/agent/providers/OpenAI.ts — GPT-4o-mini
     Uses openai SDK
   - src/agent/providers/Anthropic.ts — Claude Haiku 3.5
     Uses @anthropic-ai/sdk
   - src/agent/providers/Bedrock.ts — Generic Bedrock adapter (configurable model string)

3. Create src/agent/providers/ProviderFactory.ts:
   - resolveProvider(config: DevForgeAgentConfig): LLMProvider
   - Reads the stored provider name and returns the correct adapter
   - Throws AgentConfigError if provider name is unknown

4. Add AgentConfigError to src/utils/errors.ts extending the existing error hierarchy.

5. All network calls must have a 30-second timeout. If the request times out, throw
   AgentTimeoutError with the provider name in the message.

6. Unit tests: mock each provider's SDK, verify chat() returns string, verify
   isAvailable() returns false when credentials are invalid without throwing.

Output: src/agent/providers/ (all files), updated src/utils/errors.ts,
        tests/agent/providers/*.test.ts
```

---

### Task 1.2 — Credential Manager: First-Run Setup & Local Storage

**Description:**
On the very first `npx devforge init`, after detecting the project, DevForge must ask the user which LLM provider they want to use (or offline mode). If online, it collects credentials (API key, model name, AWS secrets, etc.) via inquirer prompts. These are stored in `~/.devforge/credentials.json`, encrypted using a machine-specific key. This question is only asked once — subsequent runs read from the stored config silently.

**Implementation Prompt:**
```
You are building the credential management system for DevForge's agentic layer.

Task: Create src/agent/credentials/ — first-run LLM setup and secure local storage.

Requirements:
1. Create src/agent/credentials/CredentialManager.ts with:
   - async isFirstRun(): Promise<boolean>
     Checks if ~/.devforge/credentials.json exists and is valid
   - async runFirstTimeSetup(): Promise<StoredCredentials>
     Runs the interactive provider selection flow
   - async loadCredentials(): Promise<StoredCredentials>
     Reads and decrypts stored credentials

2. runFirstTimeSetup() must use inquirer to ask:
   Step 1: "How do you want DevForge AI to work?"
     Options: [Online - Amazon Nova Pro (recommended), Online - Google Gemini,
               Online - OpenAI, Online - Anthropic, Online - Amazon Bedrock (custom),
               Offline - use template engine only]

   Step 2 (if online): Ask for credentials specific to the chosen provider:
     Nova Pro: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (default: us-east-1)
     Gemini: GEMINI_API_KEY
     OpenAI: OPENAI_API_KEY
     Anthropic: ANTHROPIC_API_KEY
     Bedrock custom: AWS keys + model ID string

   Step 3: "Test connection?" → calls provider.isAvailable(), shows success/failure

3. Storage:
   - Store at ~/.devforge/credentials.json
   - Encrypt using Node.js crypto (AES-256-GCM) with a key derived from the machine's
     hostname + platform using crypto.pbkdf2Sync (salt: 'devforge-v2')
   - If decryption fails (machine changed), prompt for re-setup automatically

4. StoredCredentials interface:
   {
     provider: 'nova-pro' | 'gemini' | 'openai' | 'anthropic' | 'bedrock' | 'offline';
     credentials: Record<string, string>; // encrypted
     setupAt: string; // ISO timestamp
     version: number; // for future migration
   }

5. Validate all credential strings through sanitizer.ts (no control chars, max 512 chars).

6. Update src/cli/initCommand.ts to call CredentialManager.isFirstRun() and
   runFirstTimeSetup() before any other init logic.

Output: src/agent/credentials/CredentialManager.ts, updated src/cli/initCommand.ts,
        tests/agent/credentials/CredentialManager.test.ts
```

---

### Task 1.3 — Base Agent Class and Agent Runtime

**Description:**
All specialized agents (Recommendation Agent, Security Agent, etc.) extend a single `BaseAgent` class. This class handles: injecting the LLM provider, managing conversation history for multi-turn interactions, enforcing token budgets, and falling back to a static response when the provider is unavailable. The agent runtime is the execution host that runs agents sequentially or in background.

**Implementation Prompt:**
```
You are building the agent runtime for DevForge v2 in TypeScript.

Task: Create src/agent/BaseAgent.ts and src/agent/AgentRuntime.ts.

Requirements:
1. BaseAgent abstract class:
   abstract class BaseAgent {
     protected provider: LLMProvider;
     protected history: AgentMessage[];
     protected systemPrompt: string;

     constructor(provider: LLMProvider, systemPrompt: string)

     protected async chat(userMessage: string, options?: ChatOptions): Promise<string>
       // Appends to history, calls provider.chat(), stores response
       // Enforces max history length of 20 messages (trim oldest on overflow)

     protected abstract fallback(context: AgentContext): AgentResult;
       // Called when provider is unavailable or throws

     abstract run(context: AgentContext): Promise<AgentResult>;
   }

2. Define AgentContext and AgentResult types in src/agent/types.ts:
   interface AgentContext {
     config: DevForgeConfig;           // from v1 types
     generatedFiles: string[];         // paths written by the generator
     lastRunJson: LastRunJson | null;   // from .devforge/last-run.json
   }

   interface AgentResult {
     agentName: string;
     success: boolean;
     messages: AgentOutputMessage[];   // what to print to the user
     recommendations: Recommendation[];
     warnings: AgentWarning[];
   }

   interface Recommendation {
     type: 'update' | 'security' | 'optimization';
     severity: 'low' | 'medium' | 'high' | 'critical';
     title: string;
     description: string;
     autoFixAvailable: boolean;
   }

3. AgentRuntime in src/agent/AgentRuntime.ts:
   class AgentRuntime {
     async runForeground(agent: BaseAgent, context: AgentContext): Promise<AgentResult>
       // Runs synchronously, shows ora spinner, prints result
     async runBackground(agent: BaseAgent, context: AgentContext): Promise<void>
       // Runs after generator completes, non-blocking, prints result when done
     async runAll(agents: BaseAgent[], context: AgentContext, mode: 'foreground' | 'background'): Promise<AgentResult[]>
   }

4. If an agent throws, AgentRuntime must catch, log a warning, and continue —
   an agent failure must never crash devforge init.

5. Cache layer: before calling provider.chat(), check src/agent/cache/AgentCache.ts:
   - Key: SHA-256 hash of (agentName + systemPrompt + userMessage)
   - TTL: 24 hours
   - Store: ~/.devforge/agent-cache.json (append-only, pruned on startup)

Output: src/agent/BaseAgent.ts, src/agent/AgentRuntime.ts, src/agent/types.ts,
        src/agent/cache/AgentCache.ts, tests/agent/AgentRuntime.test.ts
```

---

### Task 1.4 — Offline Mode and LLM Cache System

**Description:**
If the user selects offline mode or if the LLM provider fails, DevForge must transparently fall back to the v1 template engine with zero degradation. The cache system ensures that repeated identical requests (same project type, same question) return cached answers without consuming API quota. Cache is stored at `~/.devforge/agent-cache.json` and pruned of entries older than 24 hours on every startup.

**Implementation Prompt:**
```
You are building the offline fallback and cache system for DevForge v2.

Task: Implement offline mode integration and the persistent LLM cache.

Requirements:
1. Offline mode integration in src/agent/OfflineFallback.ts:
   - Export function isOfflineMode(credentials: StoredCredentials): boolean
   - Export function getOfflineFallbackResult(agentName: string, context: AgentContext): AgentResult
     Returns a static AgentResult with a message like:
     "DevForge is running in offline mode. AI-powered recommendations are disabled.
      Using template-based generation (v1 engine)."
     recommendations: [] (empty)
     warnings: [] (empty)

2. Integrate into BaseAgent: in the chat() method, before calling provider.chat():
   - If isOfflineMode(), return this.fallback(context) immediately
   - If provider.isAvailable() returns false, log a warning and call this.fallback()

3. AgentCache in src/agent/cache/AgentCache.ts:
   interface CacheEntry {
     key: string;      // SHA-256 hash
     response: string; // LLM response
     createdAt: number; // Unix timestamp ms
     ttlMs: number;    // default 86400000 (24h)
   }

   class AgentCache {
     private readonly cachePath: string; // ~/.devforge/agent-cache.json

     async get(key: string): Promise<string | null>
     async set(key: string, response: string, ttlMs?: number): Promise<void>
     async prune(): Promise<number> // returns count of pruned entries
     async clear(): Promise<void>
   }

4. Cache key generation — create src/agent/cache/cacheKey.ts:
   function buildCacheKey(agentName: string, systemPrompt: string, userMessage: string): string
   Uses crypto.createHash('sha256').update(agentName + '|' + systemPrompt + '|' + userMessage).digest('hex')

5. Startup hook: in src/cli/index.ts, call AgentCache.prune() on every startup.
   Do it asynchronously and do not await — prune errors must be swallowed silently.

6. Add a `devforge cache clear` subcommand that calls AgentCache.clear() and confirms.

Output: src/agent/OfflineFallback.ts, src/agent/cache/AgentCache.ts,
        src/agent/cache/cacheKey.ts, updated src/cli/index.ts,
        tests/agent/cache/AgentCache.test.ts
```

---

### Task 1.5 — Updated CLI Interface for Agentic Commands

**Description:**
Extend the v1 CLI with new commands introduced by the agentic layer: `devforge agent status` (shows provider config and cache stats), `devforge agent reset` (clears credentials and re-runs first-time setup), and `devforge cache clear`. Update the `--help` output and update the existing `init` command flow to include the first-run setup check.

**Implementation Prompt:**
```
You are extending the DevForge CLI with agentic AI commands.

Task: Add agent management commands and update the CLI router.

Requirements:
1. Register these new commands in src/cli/index.ts using commander:
   devforge agent status
     → prints: active provider, credentials masked (first 4 chars + ***),
       cache entry count, last setup date
   devforge agent reset
     → clears ~/.devforge/credentials.json, then re-runs runFirstTimeSetup()
   devforge cache clear
     → calls AgentCache.clear(), confirms to user
   devforge cache stats
     → prints count of cached entries, total size in KB, oldest entry date

2. Update the init command output banner to show the active LLM provider:
   ┌──────────────────────────────────────────┐
   │  DevForge v2 — Agentic Edition           │
   │  AI Provider: Amazon Nova Pro            │
   │  Mode: Online                            │
   └──────────────────────────────────────────┘

3. Update `devforge --help` to include a section:
   Agent Commands:
     agent status     Show AI provider configuration
     agent reset      Reconfigure AI provider
     cache clear      Clear the LLM response cache
     cache stats      Show cache usage statistics

4. Add --no-agent flag to devforge init:
   When passed, skips all agent logic and runs in offline/v1 mode for that session only
   (does not change stored credentials).

5. Write integration tests in tests/cli/agent.test.ts:
   - agent status prints provider name
   - agent reset clears the credential file
   - --no-agent flag suppresses all agent output

Output: updated src/cli/index.ts, src/cli/agentCommand.ts, src/cli/cacheCommand.ts,
        tests/cli/agent.test.ts
```

---

---

## Phase 2 — Recommendation Agent & LLM-Enhanced Init Flow

**Duration:** Week 2
**Goal:** Build the Recommendation Agent that runs automatically every time `npx devforge init` is called. It recommends updates when pipelines fail, tells users expected outputs when the pipeline changes, and proactively surfaces optimization opportunities. The agent uses conversation history to ask clarifying questions before making recommendations.

---

### Task 2.1 — Recommendation Agent Core

**Description:**
The `RecommendationAgent` extends `BaseAgent` and is the primary agent invoked on every `devforge init`. It reads the generated files, the `.devforge/last-run.json` for diff context, and any pipeline failure signals, then produces a structured list of `Recommendation` objects ranked by severity.

**Implementation Prompt:**
```
You are building the RecommendationAgent for DevForge v2.

Task: Create src/agent/agents/RecommendationAgent.ts

Requirements:
1. class RecommendationAgent extends BaseAgent:
   systemPrompt = `You are DevForge's CI/CD pipeline expert. You analyze GitHub Actions
   workflows, Dockerfiles, and deployment configurations and provide actionable,
   specific recommendations. Always respond in JSON format only.
   Response schema: { recommendations: Recommendation[], expectedOutputs: string[] }`

2. run(context: AgentContext): Promise<AgentResult>:
   Step 1: Build the analysis prompt:
     - Summarize the detected framework, deployment target, and generated file paths
     - Include the diff from last-run.json if available (what changed)
     - Include any pipeline_failure_reason from context if present
     - Max prompt length: 4000 characters (truncate older sections first)

   Step 2: Call this.chat(prompt) → parse JSON response
     - Parse the Recommendation[] array from the response
     - Parse expectedOutputs: string[] (what the pipeline will do, in plain English)

   Step 3: Return AgentResult with:
     - recommendations ranked by severity (critical → low)
     - messages: print each expectedOutput as a info-level message
     - warnings: convert 'high' and 'critical' recommendations to AgentWarning

3. fallback(context): return AgentResult with:
   - One static recommendation: type: 'optimization', severity: 'low',
     title: 'AI recommendations unavailable',
     description: 'Run in online mode for personalized pipeline recommendations.'
   - expectedOutputs derived from context.config (framework name + deployment target)

4. Export a helper: buildExpectedOutputsFromConfig(config: DevForgeConfig): string[]
   Generates static expected output descriptions from known framework × deployment
   combinations (e.g. Next.js + Vercel → "Build: next build, Deploy: vercel --prod")

Output: src/agent/agents/RecommendationAgent.ts,
        tests/agent/agents/RecommendationAgent.test.ts
```

---

### Task 2.2 — Pipeline Failure Detection and Agent Trigger

**Description:**
When the user re-runs `devforge init` or `devforge update` on a project that already has a `.github/workflows/` directory, DevForge should detect if any workflows are likely to fail based on the project's current state (missing test scripts, wrong node version, mismatched build commands). This failure prediction triggers the Recommendation Agent with a failure context.

**Implementation Prompt:**
```
You are building pipeline failure detection for DevForge v2.

Task: Create src/agent/PipelineFailureDetector.ts

Requirements:
1. Export async function detectLikelyFailures(config: DevForgeConfig, fs: DevForgeFS): Promise<FailureSignal[]>

2. interface FailureSignal {
     type: 'missing_script' | 'node_version_mismatch' | 'missing_dependency' | 'invalid_secret_ref';
     severity: 'warning' | 'error';
     message: string;
     affectedFile: string;
   }

3. Detection rules:
   - missing_script: if config.detected.testCommand is null but generated workflow has
     a test step, emit a 'missing_script' error signal
   - node_version_mismatch: read .nvmrc or engines.node from package.json;
     if the generated workflow pins a different Node version, emit a warning
   - missing_dependency: if detected framework is next.js but package.json has no
     "next" in dependencies, emit an error
   - invalid_secret_ref: read generated workflow YAML, extract all ${{ secrets.* }} refs,
     compare against SECRETS_REQUIRED.md — emit warning for any undocumented secret ref

4. Attach failure signals to AgentContext before running RecommendationAgent:
   - Add failureSignals: FailureSignal[] to AgentContext (update types.ts)
   - In initCommand.ts, run detectLikelyFailures(), attach to context, then run agent

5. In RecommendationAgent.run(), if context.failureSignals has any 'error' severity signals:
   - Prepend them to the prompt: "The following pipeline failures were detected: ..."
   - Set the tone of the LLM prompt to 'fix these issues first before optimizing'

Output: src/agent/PipelineFailureDetector.ts, updated src/agent/types.ts,
        updated src/cli/initCommand.ts, tests/agent/PipelineFailureDetector.test.ts
```

---

### Task 2.3 — Expected Output Reporter

**Description:**
Every time `devforge init` or `devforge update` completes, the Recommendation Agent must tell the user in plain English what their generated pipeline will do. This is the "Tells expected outputs on updates in pipeline" feature from the spec. The output is printed as a numbered list before returning control to the shell.

**Implementation Prompt:**
```
You are building the Expected Output Reporter for DevForge v2.

Task: Create src/agent/reporters/ExpectedOutputReporter.ts

Requirements:
1. class ExpectedOutputReporter:
   async report(result: AgentResult, config: DevForgeConfig): Promise<void>

2. Printing behavior:
   Print a bordered section after generation completes:
   ╔══════════════════════════════════════════════╗
   ║  What your pipeline will do                  ║
   ╠══════════════════════════════════════════════╣
   ║  1. Install dependencies via npm ci          ║
   ║  2. Run ESLint on all TypeScript files       ║
   ║  3. Execute Jest with coverage               ║
   ║  4. Build Next.js production bundle          ║
   ║  5. Deploy to Vercel (production branch)     ║
   ╚══════════════════════════════════════════════╝
   Use cli-table3 for rendering.

3. If result.recommendations has critical items, print them after the table:
   ⚠ Critical: <title> — <description>

4. If result.expectedOutputs is empty (offline mode / fallback):
   Use buildExpectedOutputsFromConfig() from Task 2.1 instead.

5. Add a --no-report flag to devforge init and devforge update:
   When passed, skips printing the expected output section entirely.

6. Write snapshot tests for the rendered output to prevent accidental formatting regressions.

Output: src/agent/reporters/ExpectedOutputReporter.ts,
        updated src/cli/initCommand.ts, updated src/cli/updateCommand.ts,
        tests/agent/reporters/ExpectedOutputReporter.test.ts
```

---

### Task 2.4 — Recommendation Persistence and History

**Description:**
Recommendations produced by the agent must be persisted to `.devforge/recommendations.json` in the project root. On the next run, the agent reads previous recommendations to avoid repeating the same advice and to track whether accepted recommendations were acted on (i.e., did the pipeline change after the last recommendation?).

**Implementation Prompt:**
```
You are building recommendation persistence for DevForge v2.

Task: Create src/agent/RecommendationStore.ts

Requirements:
1. interface StoredRecommendation extends Recommendation {
     id: string;               // UUID v4
     generatedAt: string;      // ISO timestamp
     status: 'new' | 'dismissed' | 'acted_on';
     devforgeVersion: string;
   }

2. class RecommendationStore:
   constructor(fs: DevForgeFS)
   async load(): Promise<StoredRecommendation[]>
     Reads .devforge/recommendations.json; returns [] if not found
   async save(recommendations: Recommendation[]): Promise<void>
     Merges new recommendations with existing (no duplicates by title + type)
     Marks items from previous run that no longer appear as 'acted_on' if the
     affected generated file changed (compare via SHA-256 hash of file content)
   async dismiss(id: string): Promise<void>
     Sets status to 'dismissed' for a specific recommendation
   async getSummary(): Promise<RecommendationSummary>
     Returns counts: { new: n, dismissed: n, acted_on: n, critical: n }

3. Add `devforge recommendations` command to CLI:
   Lists all stored recommendations grouped by status
   Shows acted_on items in green, dismissed in gray, new in yellow/red by severity

4. Add `devforge recommendations dismiss <id>` subcommand.

5. In RecommendationAgent.run(): call store.load() before building prompt,
   include previous unresolved recommendations as context:
   "Previously flagged and not yet resolved: <list>"

Output: src/agent/RecommendationStore.ts, updated src/cli/index.ts,
        src/cli/recommendationsCommand.ts,
        tests/agent/RecommendationStore.test.ts
```

---

### Task 2.5 — Agent Integration Tests and Init Flow E2E

**Description:**
Write end-to-end tests that simulate the complete `devforge init` flow with the agentic layer enabled, using mocked LLM providers. The test must cover: first-run credential setup, recommendation agent invocation, expected output report printing, recommendation persistence, and offline fallback.

**Implementation Prompt:**
```
You are writing E2E integration tests for the DevForge v2 agentic init flow.

Task: Create tests/e2e/agenticInit.test.ts

Requirements:
1. Set up a test fixture directory structure mimicking a Next.js project:
   fixtures/nextjs-vercel/package.json, fixtures/react-railway/package.json,
   fixtures/express-docker/package.json

2. Mock the LLM provider:
   Create tests/mocks/MockLLMProvider.ts implementing LLMProvider:
   - chat() returns a hardcoded valid AgentResult JSON
   - isAvailable() returns true
   - Supports a 'fail' mode where isAvailable() returns false (tests offline fallback)

3. Test scenarios (each in its own test):
   T1: First run → first-time setup is triggered → credentials saved → agent runs
   T2: Second run → credentials loaded silently → agent runs → report printed
   T3: --no-agent flag → agent is skipped → v1 template output only
   T4: Provider unavailable → offline fallback → static recommendation output
   T5: Failure signals detected → agent gets failure context → recommendations include fix
   T6: Cache hit → provider.chat() is NOT called → cached response returned

4. Assert for each scenario:
   - Files written to the fixture output directory
   - AgentResult structure validity (Zod validate)
   - Expected console output (spy on logger methods)
   - No uncaught errors

5. Cleanup: delete ~/.devforge/credentials.json and agent-cache.json after each test
   using afterEach; use a separate DEVFORGE_CONFIG_DIR env var in tests.

Output: tests/e2e/agenticInit.test.ts, tests/mocks/MockLLMProvider.ts,
        tests/fixtures/ (all fixture package.json files)
```

---

---

## Phase 3 — Security & Compliance Agent System

**Duration:** Week 3
**Goal:** Build the Security & Compliance Agent that scans generated pipelines for misconfigurations using US NIST and ISO 27001 standards. This agent runs as a background agent automatically after every generation. It detects hardcoded credentials, insecure permissions, and policy violations, then surfaces them as `critical` or `high` severity warnings.

---

### Task 3.1 — Security Agent Core with NIST/ISO Rule Engine

**Description:**
The `SecurityComplianceAgent` extends `BaseAgent` and implements a two-phase scan: first, a fast static analysis pass using hardcoded rules (no LLM required); then, an LLM-assisted deep scan for subtle misconfigurations that static rules would miss. The static pass runs even in offline mode.

**Implementation Prompt:**
```
You are building the SecurityComplianceAgent for DevForge v2.

Task: Create src/agent/agents/SecurityComplianceAgent.ts

Requirements:
1. class SecurityComplianceAgent extends BaseAgent:
   systemPrompt = `You are a DevSecOps expert specializing in GitHub Actions security.
   You analyze CI/CD workflows against NIST SP 800-53 and ISO 27001 Annex A controls.
   Respond only in JSON: { violations: ComplianceViolation[], riskScore: number (0-100) }`

2. interface ComplianceViolation {
     controlId: string;    // e.g. "NIST-AC-6" (Least Privilege)
     standard: 'NIST' | 'ISO27001';
     title: string;
     description: string;
     affectedFile: string;
     lineReference?: string;
     severity: 'low' | 'medium' | 'high' | 'critical';
     remediation: string;
   }

3. Static rule pass (runs always, no LLM):
   Implement these checks in src/agent/security/StaticSecurityScanner.ts:
   - NIST-AC-6 (Least Privilege): workflow has no `permissions` block → critical
   - NIST-AC-6 (Least Privilege): workflow uses `permissions: write-all` → high
   - NIST-SI-2 (Integrity): action uses `@master` or `@main` instead of pinned SHA → high
   - ISO-A.9.4 (Access Control): plaintext secret pattern (password=, token=, key=) in
     workflow env block (not ${{ secrets.* }} form) → critical
   - NIST-CM-6 (Config Settings): docker image uses `:latest` tag → medium
   - ISO-A.12.6 (Vulnerability Management): Node.js version in workflow < 18 → medium

4. LLM deep scan:
   Build a prompt from the generated YAML content (max 3000 chars, truncate if longer)
   Ask the LLM to identify any additional violations the static scanner missed
   Merge LLM violations with static ones (deduplicate by controlId + affectedFile)

5. run(context): runs static scan first, then LLM scan, merges results, returns AgentResult
   fallback(context): returns static scan results only (no LLM violations)

Output: src/agent/agents/SecurityComplianceAgent.ts,
        src/agent/security/StaticSecurityScanner.ts,
        tests/agent/agents/SecurityComplianceAgent.test.ts,
        tests/agent/security/StaticSecurityScanner.test.ts
```

---

### Task 3.2 — Background Agent Invocation System

**Description:**
Security and compliance agents run as **background agents** — they are invoked after the generator writes all files, and their output appears in the terminal after the main generation success message. They must not block the CLI from returning. The background system must handle agent crashes gracefully and never hang the CLI.

**Implementation Prompt:**
```
You are implementing the background agent execution system for DevForge v2.

Task: Update AgentRuntime to support true background execution and integrate
      SecurityComplianceAgent as a post-generation background agent.

Requirements:
1. Update AgentRuntime.runBackground() to use setImmediate() to defer execution:
   setImmediate(async () => {
     try {
       const result = await agent.run(context);
       printAgentResult(result);
     } catch (e) {
       logger.warn(`[agent] ${agent.name} encountered an error and was skipped`);
     }
   });
   This ensures the CLI prints "✓ Generation complete" before agent output appears.

2. Create src/agent/reporters/SecurityReporter.ts:
   Formats ComplianceViolation[] for terminal output:
   - Group by severity: critical first, then high, medium, low
   - Print each violation as:
     [CRITICAL] NIST-AC-6 — No permissions block in ci.yml
     Remediation: Add `permissions: contents: read` to your workflow.
   - If riskScore > 70: print a red banner: "⛔ High security risk detected"
   - If riskScore 40-70: print yellow banner: "⚠ Medium security risk"
   - If riskScore < 40: print green: "✓ Security scan passed"

3. Register SecurityComplianceAgent as a background agent in src/cli/initCommand.ts:
   After runGenerator() completes:
   runtime.runBackground(new SecurityComplianceAgent(provider, ...), context)

4. Add `devforge audit --security` subcommand:
   Runs SecurityComplianceAgent in foreground on demand (not just post-init)
   Takes --fix flag: for each autoFixAvailable violation, apply the fix automatically

5. Tests: verify runBackground() does not block by checking that the main init
   promise resolves before the agent output is printed.

Output: updated src/agent/AgentRuntime.ts, src/agent/reporters/SecurityReporter.ts,
        updated src/cli/initCommand.ts, updated src/cli/auditCommand.ts,
        tests/agent/AgentRuntime.background.test.ts
```

---

### Task 3.3 — Compliance Report Generator

**Description:**
After a `devforge audit --security` run, produce a `COMPLIANCE_REPORT.md` in the project root listing all violations, their NIST/ISO control IDs, risk scores, and remediation steps. This is a human-readable artifact suitable for inclusion in security reviews.

**Implementation Prompt:**
```
You are building the compliance report generator for DevForge v2.

Task: Create src/agent/security/ComplianceReportGenerator.ts

Requirements:
1. Export async function generateComplianceReport(
     violations: ComplianceViolation[],
     config: DevForgeConfig,
     fs: DevForgeFS
   ): Promise<void>

2. Report structure in COMPLIANCE_REPORT.md:
   # DevForge Security & Compliance Report
   **Generated:** <ISO timestamp>
   **Project:** <detected framework> → <deployment target>
   **Risk Score:** <n>/100

   ## Executive Summary
   | Severity | Count |
   |----------|-------|
   | Critical | n     |
   | High     | n     |
   | Medium   | n     |
   | Low      | n     |

   ## Violations

   ### [CRITICAL] NIST-AC-6 — <title>
   **File:** <affectedFile>
   **Standard:** NIST SP 800-53 / ISO 27001 Annex A
   **Description:** ...
   **Remediation:** ...

   (one section per violation, sorted by severity)

   ## Controls Checked
   List all NIST and ISO controls that were evaluated (pass + fail)

   ## How to Fix
   Step-by-step instructions for each critical/high violation.

3. Write the report using DevForgeFS (goes through the path traversal guard + atomic write).

4. If COMPLIANCE_REPORT.md already exists, create a timestamped backup:
   COMPLIANCE_REPORT_<timestamp>.md.bak (using the v1 backup pattern)

5. Print: "✓ Compliance report written to COMPLIANCE_REPORT.md"

Output: src/agent/security/ComplianceReportGenerator.ts,
        updated src/cli/auditCommand.ts,
        tests/agent/security/ComplianceReportGenerator.test.ts
```

---

### Task 3.4 — Auto-Fix Engine for Security Violations

**Description:**
For violations where `autoFixAvailable: true`, the Security Agent must be able to automatically patch the generated YAML. Implement a targeted YAML patcher that applies safe, deterministic fixes: adding `permissions` blocks, replacing `:latest` tags with specific versions, pinning action SHAs.

**Implementation Prompt:**
```
You are building the security auto-fix engine for DevForge v2.

Task: Create src/agent/security/AutoFixEngine.ts

Requirements:
1. Export async function applyAutoFixes(
     violations: ComplianceViolation[],
     fs: DevForgeFS
   ): Promise<FixResult[]>

2. interface FixResult {
     violation: ComplianceViolation;
     applied: boolean;
     description: string; // what was changed
   }

3. Implement fixes for these violation types:
   - NIST-AC-6 (missing permissions block):
     Parse workflow YAML, add `permissions: contents: read` at the top-level job level
     Use js-yaml to parse + re-serialize; never use string manipulation on YAML

   - NIST-AC-6 (write-all permissions):
     Replace `permissions: write-all` with the minimal required permissions:
     `permissions: contents: read` (user can expand manually)

   - NIST-CM-6 (:latest docker tag):
     Replace `:latest` with `:stable` in Dockerfile (conservative; log that user
     should pin to a specific version)

   - NIST-SI-2 (unpinned actions):
     Cannot be auto-fixed safely (SHA lookup requires network + trust decisions)
     Mark autoFixAvailable: false for this violation type

4. Before applying any fix:
   - Create a backup of the original file: <filename>.bak
   - Apply fix to a temp file
   - Validate the patched YAML using the existing YamlValidator from v1
   - Only then write the final file

5. Print a summary after fixes:
   ✓ Applied 3 automatic fixes
   ✗ 1 fix skipped (manual action required): NIST-SI-2

Output: src/agent/security/AutoFixEngine.ts,
        tests/agent/security/AutoFixEngine.test.ts
```

---

### Task 3.5 — Security Agent Tests and Compliance Fixtures

**Description:**
Write comprehensive tests for the entire security agent pipeline using pre-built fixture workflows that contain known vulnerabilities. Each fixture exercises one or more static rules and verifies that the agent produces the correct `ComplianceViolation` records.

**Implementation Prompt:**
```
You are writing security agent tests for DevForge v2.

Task: Create tests/agent/security/ test suite with workflow fixtures.

Requirements:
1. Create test fixture workflows in tests/fixtures/workflows/:
   - insecure-no-permissions.yml: missing permissions block
   - insecure-write-all.yml: permissions: write-all
   - insecure-unpinned-actions.yml: uses actions/checkout@main
   - insecure-hardcoded-secret.yml: env block with TOKEN=abc123
   - insecure-latest-docker.yml: Dockerfile FROM node:latest
   - clean-workflow.yml: passes all static checks

2. For StaticSecurityScanner:
   - Test each fixture → assert expected ComplianceViolation[] (type, controlId, severity)
   - Test clean-workflow.yml → assert empty violations array
   - Test that violations from one file don't bleed into another

3. For SecurityComplianceAgent with mocked LLM:
   - Mock returns two additional violations not caught by static scanner
   - Verify merged output has all static + LLM violations
   - Verify deduplication: LLM violation with same controlId + affectedFile is merged

4. For AutoFixEngine:
   - Apply fixes to insecure-no-permissions.yml → verify permissions block added
   - Apply fixes to insecure-write-all.yml → verify write-all replaced
   - Verify backup file created before each fix
   - Verify patched YAML is valid (parse with js-yaml, no throw)

5. For ComplianceReportGenerator:
   - Run against a set of mock violations → assert COMPLIANCE_REPORT.md content
   - Run twice → assert .bak file created on second run

Output: tests/agent/security/*.test.ts, tests/fixtures/workflows/*.yml
```

---

---

## Phase 4 — Python Framework Support & Extended Detection

**Duration:** Week 4
**Goal:** Extend the v1 detector and template registry to support Python-based frameworks: FastAPI, Django, and Flask. Python projects have different project structure signals (requirements.txt, pyproject.toml, Pipfile), different CI patterns, and different Docker base images. This phase also adds the LLM as a fallback detector for ambiguous or unknown projects.

---

### Task 4.1 — Python Project Detector

**Description:**
Add a `PythonProjectDetector` to the detector layer that identifies Python projects and their specific frameworks. Python detection uses `requirements.txt`, `pyproject.toml`, `Pipfile.lock`, and `manage.py` (Django) as signals, with confidence scoring matching the existing `frameworkDetector.ts` pattern.

**Implementation Prompt:**
```
You are extending the DevForge detector layer with Python framework support.

Task: Create src/detector/pythonDetector.ts

Requirements:
1. Export async function detectPythonFramework(fs: DevForgeFS): Promise<PythonDetectionResult>

2. interface PythonDetectionResult {
     isPython: boolean;
     framework: 'fastapi' | 'django' | 'flask' | 'python-generic' | null;
     confidence: number; // 0-100
     packageManager: 'pip' | 'poetry' | 'pipenv' | null;
     pythonVersion: string | null; // from .python-version or pyproject.toml
     hasRequirements: boolean;
     testFramework: 'pytest' | 'unittest' | null;
   }

3. Detection signals (each adds to confidence score):
   isPython signals (any = true):
     - requirements.txt exists: +40
     - pyproject.toml exists: +40
     - Pipfile exists: +40
     - manage.py exists: +30

   Framework signals (once isPython):
     FastAPI: 'fastapi' in requirements.txt: +60
              'uvicorn' in requirements.txt: +20
     Django: manage.py exists: +70
             'django' in requirements.txt: +40
     Flask: 'flask' in requirements.txt: +70

   Package manager:
     - Pipfile → pipenv
     - pyproject.toml with [tool.poetry] → poetry
     - requirements.txt only → pip

   Python version: read .python-version file or python-requires from pyproject.toml

4. Integrate into the main detection pipeline in src/detector/index.ts:
   Run PythonProjectDetector in parallel with the existing packageJsonParser
   If isPython and no package.json found → use Python result as primary detection
   If both exist (e.g. full-stack project) → prefer the JavaScript detection, add
   pythonContext to DetectedProject for docker stage generation

5. Update the Framework enum in src/types/index.ts:
   Add: FASTAPI = 'fastapi', DJANGO = 'django', FLASK = 'flask'

Output: src/detector/pythonDetector.ts, updated src/detector/index.ts,
        updated src/types/index.ts,
        tests/detector/pythonDetector.test.ts
```

---

### Task 4.2 — Python CI Workflow Templates

**Description:**
Create GitHub Actions workflow templates for FastAPI, Django, and Flask targeting Docker deployment. Python workflows have different install commands (`pip install -r requirements.txt`), different test runners (`pytest`), and different linting setups (`flake8`, `black`). Templates follow the same allowlist substitution pattern as the v1 template registry.

**Implementation Prompt:**
```
You are adding Python framework templates to the DevForge template registry.

Task: Create src/templates/ci/python/ — CI templates for FastAPI, Django, Flask.

Requirements:
1. Create three YAML template strings (TypeScript string literals, not files):
   - src/templates/ci/python/fastapi.ts
   - src/templates/ci/python/django.ts
   - src/templates/ci/python/flask.ts

2. Each template must include these jobs:
   lint:
     - uses actions/checkout@v4 (pinned SHA in comments)
     - setup-python@v5 with python-version: {{PYTHON_VERSION}}
     - pip install flake8 black
     - flake8 . --max-line-length=88
     - black --check .
   test:
     - pip install -r requirements.txt
     - pip install pytest pytest-cov
     - pytest --cov=. --cov-report=xml -v
     - upload coverage with codecov-action
   build:
     (FastAPI + Flask): docker build -t {{IMAGE_NAME}}:${{ github.sha }} .
     (Django): collectstatic + docker build
   deploy: (stubbed, with TODO comment for user to fill in)

3. Substitution variables for each template (allowlist in templateRenderer.ts):
   {{PYTHON_VERSION}}, {{IMAGE_NAME}}, {{APP_MODULE}} (FastAPI: main:app),
   {{PORT}}, {{PROJECT_NAME}}

4. Register these templates in src/templates/registry.ts:
   Add entries: fastapi-docker, django-docker, flask-docker
   Following the exact same TemplateEntry structure as existing JS templates

5. Django-specific: generate a management command step:
   python manage.py check --deploy
   python manage.py migrate --run-syncdb (for test environments)

6. Write template render tests: render each template with sample substitutions,
   validate the output YAML using the existing YamlValidator.

Output: src/templates/ci/python/*.ts, updated src/templates/registry.ts,
        tests/templates/python*.test.ts
```

---

### Task 4.3 — Python Docker Templates

**Description:**
Generate production-grade multi-stage Dockerfiles for FastAPI, Django, and Flask applications. Python Docker builds differ from Node.js: they use `pip install --no-cache-dir`, separate `requirements.txt` copy for layer caching, and `gunicorn`/`uvicorn` as the process manager in production.

**Implementation Prompt:**
```
You are adding Python Dockerfile templates to DevForge's docker generation layer.

Task: Create src/docker/python/ — Dockerfile templates for Python frameworks.

Requirements:
1. Create Dockerfile template strings for:
   - src/docker/python/fastapi.dockerfile.ts
   - src/docker/python/django.dockerfile.ts
   - src/docker/python/flask.dockerfile.ts

2. Each Dockerfile must be multi-stage and follow these patterns:
   Stage 1 (builder):
     FROM python:{{PYTHON_VERSION}}-slim as builder
     WORKDIR /app
     COPY requirements.txt .
     RUN pip install --no-cache-dir --user -r requirements.txt

   Stage 2 (production):
     FROM python:{{PYTHON_VERSION}}-slim
     RUN useradd --no-create-home --no-log-init devforge-runner
     WORKDIR /app
     COPY --from=builder /root/.local /root/.local
     COPY . .
     USER devforge-runner
     EXPOSE {{PORT}}
     CMD:
       FastAPI: ["uvicorn", "{{APP_MODULE}}", "--host", "0.0.0.0", "--port", "{{PORT}}"]
       Django: ["gunicorn", "{{WSGI_MODULE}}", "--bind", "0.0.0.0:{{PORT}}"]
       Flask: ["gunicorn", "--bind", "0.0.0.0:{{PORT}}", "{{WSGI_MODULE}}"]

3. Add a .dockerignore template for Python projects:
   __pycache__/, *.pyc, *.pyo, *.pyd, .env, .venv, venv/, *.egg-info/,
   .pytest_cache/, .coverage, htmlcov/

4. Register in dockerGenerator.ts:
   Add detectAndGeneratePythonDockerfile(config, fs, substitutions) handler
   Called when config.detected.framework is fastapi | django | flask

5. Tests: render each Dockerfile template, run through a basic linter
   (check FROM exists, USER is non-root, EXPOSE is present).

Output: src/docker/python/*.ts, updated src/docker/dockerGenerator.ts,
        updated src/templates/registry.ts,
        tests/docker/python*.test.ts
```

---

### Task 4.4 — LLM-Assisted Detection Fallback

**Description:**
For projects that the static detector cannot classify with confidence ≥ 60 (unknown framework, monorepos, polyglot projects), delegate to the LLM provider for assistance. The LLM is given a summary of the project's directory structure and key files and asked to identify the framework.

**Implementation Prompt:**
```
You are adding LLM-assisted detection fallback to DevForge v2.

Task: Create src/agent/agents/DetectionAssistantAgent.ts

Requirements:
1. class DetectionAssistantAgent extends BaseAgent:
   systemPrompt = `You are a framework detection expert. Given a project's file listing
   and package.json/requirements.txt contents, identify the primary web framework.
   Respond only in JSON: { framework: string, confidence: number, reasoning: string }`

2. Trigger condition: in src/detector/index.ts, after running all static detectors,
   if the best confidence score < 60:
   - instantiate DetectionAssistantAgent
   - run it with the low-confidence context
   - if the agent returns confidence >= 70, use its result
   - otherwise, proceed with 'unknown' framework

3. Build the detection prompt:
   - List all files in root (max depth 2, max 50 files)
   - Include first 200 chars of package.json (or requirements.txt)
   - Include any detected signals so far: "Static analysis detected X with Y confidence"

4. Map LLM framework strings to the Framework enum safely:
   Create a safe mapper: llmFrameworkToEnum(raw: string): Framework
   Only map if the string exactly matches a known Framework value; otherwise return UNKNOWN

5. fallback(): return the low-confidence static result unchanged (never block init)

6. Log: "⚡ AI-assisted detection: identified <framework> with <confidence>% confidence"
   or in offline mode: "Detection confidence low. Consider specifying --framework flag."

7. Add --framework flag to devforge init for manual override:
   devforge init --framework fastapi
   Skips detection entirely, uses the specified framework value.

Output: src/agent/agents/DetectionAssistantAgent.ts,
        updated src/detector/index.ts, updated src/cli/initCommand.ts,
        tests/agent/agents/DetectionAssistantAgent.test.ts
```

---

### Task 4.5 — Python Framework E2E Tests

**Description:**
Write full end-to-end tests for the Python detection and generation pipeline using fixture Python projects. Verify that FastAPI, Django, and Flask projects are correctly detected, the right templates are selected, the Dockerfiles are generated with non-root users, and the security scanner catches Python-specific issues.

**Implementation Prompt:**
```
You are writing E2E tests for DevForge v2 Python framework support.

Task: Create tests/e2e/pythonFrameworks.test.ts

Requirements:
1. Create fixtures in tests/fixtures/python/:
   fastapi/: main.py, requirements.txt (with fastapi, uvicorn), no package.json
   django/: manage.py, requirements.txt (with django), settings.py stub
   flask/: app.py, requirements.txt (with flask), no manage.py

2. Test scenarios:
   T1 (FastAPI): detect → FastAPI with confidence >= 80, template = fastapi-docker,
     Dockerfile uses uvicorn CMD, workflow has pytest step
   T2 (Django): detect → Django with confidence >= 90 (manage.py is high-signal),
     template = django-docker, workflow has `manage.py check --deploy`
   T3 (Flask): detect → Flask with confidence >= 80, Dockerfile uses gunicorn CMD
   T4 (LLM fallback): empty fixture with only an uncommon framework in requirements.txt
     → static confidence < 60 → DetectionAssistantAgent invoked (mocked) → result used
   T5 (--framework override): pass --framework fastapi → detection skipped → FastAPI templates used
   T6 (Python Docker): assert generated Dockerfile has USER devforge-runner (non-root),
     multi-stage build (two FROM lines), EXPOSE statement

3. For each test, assert:
   - Generated .github/workflows/ci.yml is valid YAML
   - Generated Dockerfile passes basic lint checks
   - No files written outside the fixture output directory (path traversal guard)

4. Python-specific security scanner test:
   Generate a FastAPI Dockerfile with :latest tag → SecurityComplianceAgent flags NIST-CM-6

Output: tests/e2e/pythonFrameworks.test.ts, tests/fixtures/python/
```

---

---

## Phase 5 — Extended Deployment Targets (EKS, ECS) & Memory System

**Duration:** Week 5
**Goal:** Add Amazon EKS and Amazon ECS as deployment targets with Kubernetes manifest generation and ECS task definition templates. Implement the Amazon Elastic-based memory storage for the agent — agents can recall past interactions across sessions for the same project, improving recommendation quality over time.

---

### Task 5.1 — Amazon EKS Deployment Target

**Description:**
Add EKS as a deployment target. EKS generation produces: a GitHub Actions workflow with AWS credentials, a `k8s/deployment.yaml`, a `k8s/service.yaml`, and a `k8s/ingress.yaml`. The generated manifests follow least-privilege AWS IAM patterns and use ECR as the container registry.

**Implementation Prompt:**
```
You are adding Amazon EKS deployment support to DevForge v2.

Task: Create src/templates/deploy/eks.ts and src/generator/eksGenerator.ts

Requirements:
1. CI/CD workflow template (eks.yml):
   Jobs:
   - build: build and push Docker image to ECR
     - Configure AWS credentials via aws-actions/configure-aws-credentials@v4
     - Login to ECR via aws-actions/amazon-ecr-login@v2
     - Build: docker build -t {{ECR_REGISTRY}}/{{IMAGE_NAME}}:${{ github.sha }} .
     - Push to ECR
   - deploy: deploy to EKS
     - aws eks update-kubeconfig --name {{EKS_CLUSTER_NAME}} --region {{AWS_REGION}}
     - kubectl set image deployment/{{APP_NAME}} {{APP_NAME}}={{ECR_REGISTRY}}/{{IMAGE_NAME}}:${{ github.sha }}
     - kubectl rollout status deployment/{{APP_NAME}}

2. Kubernetes manifests:
   k8s/deployment.yaml:
     apiVersion: apps/v1, kind: Deployment
     replicas: {{REPLICAS}} (default 2)
     image: {{ECR_REGISTRY}}/{{IMAGE_NAME}}:latest (placeholder)
     resources: requests/limits for CPU and memory
     livenessProbe + readinessProbe on /health
   k8s/service.yaml: ClusterIP service on port {{PORT}}
   k8s/ingress.yaml: basic ingress with host {{DOMAIN}} (placeholder)

3. Substitution variables: {{ECR_REGISTRY}}, {{IMAGE_NAME}}, {{EKS_CLUSTER_NAME}},
   {{AWS_REGION}}, {{APP_NAME}}, {{REPLICAS}}, {{PORT}}, {{DOMAIN}}

4. Required secrets: list in SECRETS_REQUIRED.md:
   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (or OIDC role ARN — add OIDC option)

5. Register: DeploymentTarget.AWS_EKS in types, template id 'eks'

6. YAML Validator: validate all three k8s manifests through yamlValidator.ts
   Add structural checks: Deployment has spec.selector matching spec.template.labels

Output: src/templates/deploy/eks.ts, src/generator/eksGenerator.ts,
        updated src/types/index.ts, updated src/templates/registry.ts,
        tests/generator/eksGenerator.test.ts
```

---

### Task 5.2 — Amazon ECS Deployment Target

**Description:**
Add Amazon ECS (Elastic Container Service) as a deployment target. ECS generation produces a GitHub Actions workflow using the official `amazon-ecs-deploy-task-definition` action and a `task-definition.json` template with sensible defaults for CPU, memory, and container port mapping.

**Implementation Prompt:**
```
You are adding Amazon ECS deployment support to DevForge v2.

Task: Create src/templates/deploy/ecs.ts and src/generator/ecsGenerator.ts

Requirements:
1. CI/CD workflow template (ecs.yml):
   Jobs:
   - build: build + push to ECR (same pattern as EKS)
   - deploy:
     - Download task definition:
       aws ecs describe-task-definition --task-definition {{TASK_FAMILY}} --query taskDefinition > task-def.json
     - Update image in task definition:
       uses: aws-actions/amazon-ecs-render-task-definition@v1
       with: task-definition: task-def.json, container-name: {{CONTAINER_NAME}}, image: <ECR image URI>
     - Deploy:
       uses: aws-actions/amazon-ecs-deploy-task-definition@v1
       with: cluster: {{ECS_CLUSTER}}, service: {{ECS_SERVICE}}, wait-for-service-stability: true

2. Task definition template (ecs/task-definition.json):
   {
     "family": "{{TASK_FAMILY}}",
     "networkMode": "awsvpc",
     "requiresCompatibilities": ["FARGATE"],
     "cpu": "{{CPU}}", "memory": "{{MEMORY}}",
     "executionRoleArn": "{{EXECUTION_ROLE_ARN}}",
     "containerDefinitions": [{
       "name": "{{CONTAINER_NAME}}",
       "image": "{{ECR_REGISTRY}}/{{IMAGE_NAME}}:latest",
       "portMappings": [{"containerPort": {{PORT}}, "protocol": "tcp"}],
       "logConfiguration": { "logDriver": "awslogs", ... }
     }]
   }

3. Generate an ecs/ directory with: task-definition.json, README with deployment steps

4. SECRETS_REQUIRED.md additions: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
   TASK_FAMILY, ECS_CLUSTER, ECS_SERVICE, EXECUTION_ROLE_ARN

5. Register DeploymentTarget.AWS_ECS in types, template id 'ecs'

6. Validate task-definition.json with Zod before writing:
   Required fields: family, networkMode, requiresCompatibilities, cpu, memory, containerDefinitions

Output: src/templates/deploy/ecs.ts, src/generator/ecsGenerator.ts,
        updated src/types/index.ts, tests/generator/ecsGenerator.test.ts
```

---

### Task 5.3 — Agent Memory System (Amazon Elastic)

**Description:**
Implement the agent memory system using Amazon Elastic (Elasticsearch). Each project gets a memory namespace keyed by the project's git remote URL (or a hash of the absolute path). Agents store and retrieve past recommendations, detection results, and user preferences across sessions.

**Implementation Prompt:**
```
You are building the agent memory system for DevForge v2 using Amazon Elasticsearch.

Task: Create src/agent/memory/ElasticMemoryStore.ts

Requirements:
1. interface AgentMemory {
     projectKey: string;         // SHA-256 of git remote URL or project root path
     timestamp: string;          // ISO
     agentName: string;
     memoryType: 'recommendation' | 'detection' | 'user_preference' | 'compliance';
     data: Record<string, unknown>; // serialized payload
     ttlDays: number;             // default 30
   }

2. class ElasticMemoryStore:
   constructor(elasticUrl: string, apiKey: string, indexName = 'devforge-agent-memory')

   async store(memory: AgentMemory): Promise<void>
     POST to /{indexName}/_doc with the memory object

   async retrieve(projectKey: string, agentName?: string, limit = 10): Promise<AgentMemory[]>
     GET /{indexName}/_search with query: { bool: { must: [{ term: { projectKey } }] } }
     If agentName provided, add to must array

   async purgeExpired(): Promise<number>
     DELETE by query: timestamp < now - ttlDays

   isConfigured(): boolean
     Returns true only if ELASTIC_URL and ELASTIC_API_KEY are in stored credentials

3. Integration:
   - Add elasticMemory (optional) to StoredCredentials in CredentialManager
   - In runFirstTimeSetup(), after LLM provider setup:
     "Do you want to enable agent memory? (stores recommendations across sessions)"
     If yes → ask for Elasticsearch URL and API key
   - In BaseAgent.run(): if memory store is configured:
     - Before chat: retrieve last 5 memories for this project + agent → inject as context
     - After result: store the AgentResult summary as a new memory

4. Fallback: if ElasticMemoryStore is not configured or throws, agent runs without memory
   (no error, just no memory context injected)

5. Project key derivation: src/agent/memory/projectKey.ts
   Try git remote get-url origin → SHA-256
   Fallback: SHA-256 of process.cwd()

Output: src/agent/memory/ElasticMemoryStore.ts, src/agent/memory/projectKey.ts,
        updated src/agent/BaseAgent.ts, updated src/agent/credentials/CredentialManager.ts,
        tests/agent/memory/ElasticMemoryStore.test.ts
```

---

### Task 5.4 — EKS/ECS Inquirer Prompts and CLI Integration

**Description:**
Extend the `devforge init` inquirer flow to offer EKS and ECS as deployment targets when AWS credentials are configured. For these targets, collect the additional required configuration (cluster name, ECR registry URL, task family) interactively and store them in `.devforge/config.json`.

**Implementation Prompt:**
```
You are extending the DevForge init CLI to support EKS and ECS deployment targets.

Task: Update src/cli/prompts.ts to include EKS and ECS options and collect AWS config.

Requirements:
1. In the deployment target selection prompt, add:
   New options: "Amazon EKS (Kubernetes)" and "Amazon ECS (Fargate)"

2. If EKS is selected, show additional prompts:
   - "EKS Cluster Name" (string, required, max 128 chars)
   - "AWS Region" (default: us-east-1)
   - "ECR Registry URL" (e.g. 123456789.dkr.ecr.us-east-1.amazonaws.com)
   - "App Name (used as k8s deployment name)" (lowercase, alphanumeric + hyphens only)
   - "Replica Count" (number, default: 2, min: 1, max: 10)
   - "Domain (for ingress, optional)" (can be blank)

3. If ECS is selected, show additional prompts:
   - "ECS Cluster Name"
   - "ECS Service Name"
   - "Task Family Name"
   - "Container Name"
   - "CPU (256|512|1024|2048|4096)" (select list)
   - "Memory (MB)" (validated against valid Fargate combinations)

4. All inputs sanitized via sanitizer.ts before use.

5. Store all AWS-specific config in DevForgeConfig.awsConfig (new optional field):
   interface AwsConfig {
     region: string;
     ecrRegistry: string;
     clusterName: string;
     serviceName?: string;    // ECS
     taskFamily?: string;     // ECS
     appName?: string;        // EKS
     replicas?: number;       // EKS
     domain?: string;         // EKS
   }

6. Pass awsConfig through to the generator so substitution variables are populated.

Output: updated src/cli/prompts.ts, updated src/types/index.ts,
        updated src/generator/eksGenerator.ts, updated src/generator/ecsGenerator.ts,
        tests/cli/prompts.aws.test.ts
```

---

### Task 5.5 — Memory-Enhanced Recommendations and Cross-Session Learning

**Description:**
With the memory system in place, enhance the Recommendation Agent to incorporate past session data. If the same project has been analyzed before, the agent can tell users which recommendations from previous runs were acted on, and avoid repeating advice the user has already dismissed.

**Implementation Prompt:**
```
You are enhancing RecommendationAgent with cross-session memory for DevForge v2.

Task: Update RecommendationAgent to use ElasticMemoryStore context.

Requirements:
1. In RecommendationAgent.run():
   If memory store is configured:
   - Retrieve last 5 memories where agentName = 'RecommendationAgent'
   - Extract past recommendations from memory.data.recommendations
   - Add to prompt: "In past sessions for this project, these issues were flagged:
     <list>. These were marked as acted_on: <list>. Avoid repeating acted_on advice."

2. After run() completes:
   Store the new AgentResult to memory:
   {
     agentName: 'RecommendationAgent',
     memoryType: 'recommendation',
     data: { recommendations: result.recommendations, riskScore: result.riskScore }
   }

3. Cross-session diff report:
   If previous memories exist, compute what changed:
   - New issues (in current, not in previous)
   - Resolved issues (in previous with status 'acted_on')
   - Persistent issues (same title in both)
   Print this as a section in ExpectedOutputReporter:
   "Changes since last scan: +2 new issues, 1 resolved, 3 persistent"

4. User preference memory:
   After the init prompt flow, store the user's choices in memory:
   memoryType: 'user_preference', data: { deploymentTarget, branchStrategy, ... }
   On next run: pre-fill inquirer prompt defaults from stored preferences
   "Last time you used Vercel. Use again? [Y/n]"

5. Add `devforge memory stats` command:
   Prints: project key, total memories stored, memory store URL (masked),
   oldest memory date, total size estimate

Output: updated src/agent/agents/RecommendationAgent.ts,
        updated src/agent/reporters/ExpectedOutputReporter.ts,
        updated src/cli/prompts.ts, src/cli/memoryCommand.ts,
        tests/agent/agents/RecommendationAgent.memory.test.ts
```

---

---

## Phase 6 — Jenkins Integration, Automated Pipeline Execution & npm Release

**Duration:** Week 6
**Goal:** Add Jenkins as a CI target with `Jenkinsfile` generation, implement the Automated Pipeline Execution Engine that can trigger GitHub Actions runs via the GitHub API, finalize the npm release pipeline for v2, and produce complete v2 documentation.

---

### Task 6.1 — Jenkins Integration and Jenkinsfile Generation

**Description:**
Add Jenkins as a CI platform alongside GitHub Actions. When the user selects Jenkins, DevForge generates a `Jenkinsfile` (declarative pipeline syntax) instead of a GitHub Actions workflow. The Jenkins templates cover the same framework × deployment combinations as the GitHub Actions templates.

**Implementation Prompt:**
```
You are adding Jenkins CI support to DevForge v2.

Task: Create src/templates/ci/jenkins/ and src/generator/jenkinsGenerator.ts

Requirements:
1. Add 'jenkins' as a CIPlatform option alongside 'github-actions':
   enum CIPlatform { GITHUB_ACTIONS = 'github-actions', JENKINS = 'jenkins' }
   Add to DevForgeConfig.user: ciPlatform: CIPlatform

2. Jenkinsfile template for Node.js projects (src/templates/ci/jenkins/nodejs.ts):
   pipeline {
     agent any
     environment { NODE_VERSION = '{{NODE_VERSION}}' }
     tools { nodejs 'NodeJS-{{NODE_VERSION}}' }
     stages {
       stage('Install') { steps { sh '{{INSTALL_COMMAND}}' } }
       stage('Lint')    { steps { sh '{{LINT_COMMAND}}'    } }
       stage('Test')    { steps { sh '{{TEST_COMMAND}}'    } }
       stage('Build')   { steps { sh '{{BUILD_COMMAND}}'  } }
       stage('Docker') {
         when { branch '{{DEPLOY_BRANCH}}' }
         steps { sh 'docker build -t {{IMAGE_NAME}}:${BUILD_NUMBER} .' }
       }
     }
     post {
       failure  { mail to: '{{NOTIFY_EMAIL}}', subject: "Pipeline Failed: ${currentBuild.fullDisplayName}" }
       success  { echo 'Pipeline passed.' }
     }
   }

3. Jenkinsfile template for Python projects (src/templates/ci/jenkins/python.ts):
   Same structure but: sh 'pip install -r requirements.txt', sh 'pytest'

4. jenkinsGenerator.ts:
   async function generateJenkinsfile(config: DevForgeConfig, fs: DevForgeFS): Promise<void>
   Writes Jenkinsfile to project root using DevForgeFS (atomic write, dry-run safe)

5. Add Jenkins prompt to inquirer flow:
   "Which CI platform?" → GitHub Actions / Jenkins
   If Jenkins: ask NOTIFY_EMAIL and DEPLOY_BRANCH (default: main)

6. YAML Validator does not apply to Jenkinsfiles; add a basic Jenkinsfile linter:
   Checks: pipeline {} block exists, stages {} block exists, agent directive present

Output: src/templates/ci/jenkins/*.ts, src/generator/jenkinsGenerator.ts,
        updated src/cli/prompts.ts, updated src/types/index.ts,
        tests/generator/jenkinsGenerator.test.ts
```

---

### Task 6.2 — Automated Pipeline Execution Engine

**Description:**
The Automated Pipeline Execution Engine allows DevForge to trigger GitHub Actions workflow runs via the GitHub API immediately after generating the pipeline. The user can opt in to this during `devforge init`. This feature requires a GitHub token with `workflow` scope and uses the `workflow_dispatch` API endpoint.

**Implementation Prompt:**
```
You are building the Automated Pipeline Execution Engine for DevForge v2.

Task: Create src/engine/PipelineExecutionEngine.ts

Requirements:
1. class PipelineExecutionEngine:
   constructor(githubToken: string, repoOwner: string, repoName: string)

   async triggerWorkflow(workflowFile: string, ref = 'main'): Promise<TriggerResult>
     POST to https://api.github.com/repos/{owner}/{repo}/actions/workflows/{workflowFile}/dispatches
     Body: { ref, inputs: {} }
     Returns: { triggered: boolean, runUrl: string | null, error?: string }

   async getLatestRunStatus(workflowFile: string): Promise<WorkflowRunStatus>
     GET https://api.github.com/repos/{owner}/{repo}/actions/workflows/{workflowFile}/runs?per_page=1
     Returns: { status: 'queued' | 'in_progress' | 'completed', conclusion: string | null }

   async waitForCompletion(workflowFile: string, timeoutMs = 300000): Promise<WorkflowRunStatus>
     Polls getLatestRunStatus() every 10 seconds until completed or timeout

2. In initCommand.ts, after all files are written:
   Ask: "Trigger the generated pipeline now? (requires GITHUB_TOKEN with workflow scope) [y/N]"
   If yes:
   - Ask for GITHUB_TOKEN if not already in stored credentials
   - Ask for repo owner and repo name (try to detect from git remote URL first)
   - Call triggerWorkflow() → print run URL
   - Ask: "Watch pipeline status? [y/N]"
   - If yes: call waitForCompletion() with an ora spinner showing current status

3. All API calls must:
   - Use Node.js built-in fetch (Node 18+)
   - Set User-Agent: devforge/2.0
   - Have 30-second timeout
   - Sanitize all string inputs (owner, repo, workflow file name) through sanitizer.ts

4. Detect git remote URL: run `git remote get-url origin` via child_process.execFile
   (not exec — avoid shell injection)
   Parse GitHub URL: https://github.com/{owner}/{repo}.git

5. Store GITHUB_TOKEN in CredentialManager under 'github' key (encrypted, same as LLM creds)

Output: src/engine/PipelineExecutionEngine.ts,
        updated src/cli/initCommand.ts, updated src/agent/credentials/CredentialManager.ts,
        tests/engine/PipelineExecutionEngine.test.ts
```

---

### Task 6.3 — npm Release Pipeline for v2

**Description:**
Update the semantic-release configuration and GitHub Actions release workflow for v2. The v2 release has breaking changes (new commands, new dependencies), so the release must be tagged as a major version bump. Update `package.json` with all new v2 dependencies and ensure the npm publish flow works correctly.

**Implementation Prompt:**
```
You are preparing the DevForge v2 npm release.

Task: Update release configuration, package.json, and publish workflow for v2.

Requirements:
1. Update package.json:
   New dependencies to add:
   - @aws-sdk/client-bedrock-runtime (EKS + Nova Pro)
   - @google/generative-ai (Gemini)
   - openai (OpenAI provider)
   - @anthropic-ai/sdk (Anthropic provider)
   - @elastic/elasticsearch (memory store)
   - uuid (recommendation IDs)
   All pinned to exact versions with save-exact: true.

   Update "bin": { "devforge": "dist/cli/index.js" }
   Update "engines": { "node": ">=18.0.0" } (fetch is built-in from Node 18)

2. Update .releaserc.json:
   Force next release to be major (v2.0.0):
   Add to plugins: ["@semantic-release/exec", { "prepareCmd": "echo 'v2 release'" }]
   Add BREAKING CHANGE footer to the triggering commit message.

3. Update .github/workflows/release.yml:
   Add NPM_TOKEN, GITHUB_TOKEN to required secrets list (comment)
   Add: after semantic-release, post a GitHub Release with the generated CHANGELOG excerpt
   Add: run smoke test after publish: npx devforge@latest --version

4. Update .npmignore to also exclude:
   tests/fixtures/, benchmarks/, scripts/, docs/internal/

5. Run prepublishOnly checklist:
   npm run lint && npm run test:coverage && npm run build && npm audit --audit-level=high
   Add: node dist/cli/index.js --version (dist smoke test)

6. Update CHANGELOG.md with v2 highlights:
   ## v2.0.0 — Agentic Edition
   - Multi-LLM provider support (Amazon Nova Pro, Gemini, OpenAI, Anthropic, Bedrock)
   - Recommendation Agent (auto-invoked on init)
   - Security & Compliance Agent (NIST SP 800-53 / ISO 27001)
   - Python framework support (FastAPI, Django, Flask)
   - Amazon EKS and ECS deployment targets
   - Jenkins CI integration
   - Agent memory with Amazon Elastic
   - Automated Pipeline Execution Engine

Output: updated package.json, .releaserc.json, .github/workflows/release.yml,
        .npmignore, CHANGELOG.md
```

---

### Task 6.4 — v2 README and Documentation Update

**Description:**
Update the DevForge README and docs/ directory to cover all v2 features. The README must clearly explain the agentic upgrade, the multi-LLM provider setup, offline mode, and the new commands. Update the comparison table to include AI-powered features.

**Implementation Prompt:**
```
You are writing the v2 documentation for DevForge.

Task: Update README.md and docs/ for the Agentic Edition.

Requirements:
1. README.md updates:
   - Update tagline: "Production-ready CI/CD pipelines, now with AI-powered recommendations."
   - Add a new "AI Features" section before Quick Start:
     ✦ Automatic LLM provider setup (Amazon Nova Pro, Gemini, OpenAI, Anthropic)
     ✦ Recommendation Agent — runs on every init, flags pipeline issues
     ✦ Security & Compliance Agent — NIST SP 800-53 + ISO 27001 scanning
     ✦ Cross-session memory via Amazon Elastic
     ✦ Full offline mode — AI is optional, v1 engine always works
   - Update Quick Start to show the first-run provider selection prompt
   - Update features comparison table to add:
     AI Recommendations | ✓ (DevForge) | — | ✓ (Workik) | —
     Compliance Scanning | ✓ | — | — | —
     Offline Mode        | ✓ | ✓ | — | ✓
   - Add Python frameworks to Supported Frameworks section
   - Add Jenkins to Supported CI section
   - Add EKS, ECS to Supported Deployment Targets

2. docs/AGENT.md (new):
   - How the agent system works
   - LLM provider setup guide (all 5 providers with exact config steps)
   - Offline mode documentation
   - Cache system explanation
   - Memory system setup (Amazon Elastic)
   - Agent commands reference: agent status, agent reset, cache clear, memory stats

3. docs/SECURITY_COMPLIANCE.md (new):
   - NIST SP 800-53 controls checked by the scanner
   - ISO 27001 Annex A controls checked
   - How to read a compliance report
   - Auto-fix capabilities and limitations

4. docs/PYTHON.md (new):
   - FastAPI, Django, Flask support details
   - Generated file examples
   - Python Docker best practices enforced by DevForge

5. Update docs/COMMANDS.md with all new v2 commands:
   agent status, agent reset, cache clear, cache stats,
   recommendations, recommendations dismiss, memory stats

Output: updated README.md, docs/AGENT.md, docs/SECURITY_COMPLIANCE.md,
        docs/PYTHON.md, updated docs/COMMANDS.md
```

---

### Task 6.5 — Final Performance Hardening and v2.0.0 Tag

**Description:**
Run performance benchmarks on the v2 init flow with AI enabled and disabled. Establish a performance budget for the new agentic path. Add a `--benchmark` flag for timing output, run a full security audit of all new dependencies, and perform a final end-to-end smoke test before tagging v2.0.0.

**Implementation Prompt:**
```
You are running final performance hardening for DevForge v2.

Task: Benchmark the agentic init flow and finalize v2.0.0 readiness.

Requirements:
1. Update benchmarks/init.bench.ts with v2 scenarios:
   - init with LLM provider (mocked, no real network): target p95 < 5000ms
   - init without agent (--no-agent): target p95 < 3000ms (same as v1 budget)
   - agent cache hit path: target p95 < 3200ms (< 200ms overhead vs no-cache)
   For each: print Δ vs v1 baseline.

2. Add --benchmark / --timing flag to devforge init:
   Include new agentic timing sections:
   ✓ Credential load:        12ms
   ✓ Detection:             142ms
   ✓ LLM Provider init:      8ms
   ✓ Recommendation Agent:  890ms  (or "cache hit: 3ms")
   ✓ Rule Engine:            8ms
   ✓ Rendering:             23ms
   ✓ YAML Validation:       31ms
   ✓ Writing:               89ms
   ✓ Security Agent:        720ms  (background)
   ─────────────────────────────────
   Total (foreground):     1213ms

3. Dependency audit for all new v2 deps:
   npm audit --audit-level=moderate
   Document any accepted risks in docs/SECURITY.md with rationale

4. Update scripts/release-check.sh:
   Add: node dist/cli/index.js agent status (verify credential manager initializes)
   Add: node dist/cli/index.js --no-agent --dry-run (v2 smoke test)
   Add: npm run bench (run benchmarks, fail if any p95 > budget)

5. v2.0.0 checklist in CHANGELOG.md:
   - All 6 v2 phases complete
   - Coverage > 80% (including new agent code)
   - Zero high/critical vulnerabilities in npm audit
   - All LLM providers have isAvailable() tests
   - Offline mode tested and working
   - Python frameworks E2E passing
   - EKS and ECS templates YAML-valid
   - Jenkins templates lint-passing
   - Performance budgets met
   - README and docs updated

Output: updated benchmarks/init.bench.ts, updated src/cli/initCommand.ts,
        updated scripts/release-check.sh, updated CHANGELOG.md,
        docs/SECURITY.md updates
```

---

---

## Appendix: v2 Technology Stack (additions to v1)

| Layer | Technology | Reason |
|---|---|---|
| LLM — Default | Amazon Nova Pro (Bedrock) | Best performance/cost ratio; AWS ecosystem alignment |
| LLM — Alternatives | Google Gemini, OpenAI, Anthropic, Bedrock custom | User choice, provider flexibility |
| Agent SDK | Custom BaseAgent (TypeScript) | No framework dependency; full control |
| Memory Store | Amazon Elastic (Elasticsearch) | Scalable, cross-session agent memory |
| Credential Storage | Node.js crypto (AES-256-GCM) | Secure local credential encryption |
| Cache | JSON file + SHA-256 keys | Lightweight, zero dependencies |
| Pipeline Execution | GitHub REST API (built-in fetch) | No extra SDK needed, Node 18+ |
| Python Detection | Custom file scanner | Mirrors v1 JS detection pattern |
| Kubernetes Manifests | YAML string templates | Same allowlist renderer as v1 |
| Jenkins Pipelines | Groovy string templates | Matches Jenkinsfile declarative syntax |

---

## Appendix: Agentic Security Principles (additions to v1)

1. **Credentials encrypted at rest** — AES-256-GCM with machine-derived key. Credentials never appear in logs.
2. **LLM inputs sanitized** — All user data is sanitized before being included in any LLM prompt.
3. **LLM outputs validated** — All LLM responses are parsed as JSON against Zod schemas before use. Raw LLM strings never reach the file system.
4. **No LLM-generated code executed** — The LLM produces recommendations only. Code generation remains in the deterministic template engine.
5. **Offline-first** — All agentic features degrade gracefully to the v1 template engine. Network failures are caught and logged, never surfaced as crashes.
6. **Memory isolation** — Each project gets an isolated memory namespace. No cross-project data bleed.
7. **GitHub token scoped** — Pipeline execution uses the minimum required scope (`workflow`). Token is stored encrypted alongside LLM credentials.
8. **Prompt injection prevention** — User-supplied project data included in LLM prompts is sanitized, length-capped, and clearly delimited from instruction text.
9. **Agent results are advisory only** — Agents never write to disk directly. All file writes go through the v1 `DevForgeFS` layer with its full security stack.
10. **Cache keys are hashed** — Cached data is keyed by SHA-256 hash. The cache never stores user credentials or raw source code content.
