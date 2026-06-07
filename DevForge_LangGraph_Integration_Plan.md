# DevForge — LangChain & LangGraph Integration Plan

> **Project:** DevForge — AI-Powered Agentic CI/CD Pipeline Generator  
> **Scope:** Add LangGraph orchestration on top of the existing v2 agent layer  
> **Principle:** Agents orchestrate and augment; the v1 deterministic core (detection, rule engine, templates, validators) is never replaced  
> **Runtime:** TypeScript in-process (`@langchain/langgraph` + `@langchain/core`)  
> **Status:** Tasks 1–5 complete

---

## Why LangGraph Here

DevForge already has specialized agents (`RecommendationAgent`, `SecurityComplianceAgent`), a custom `BaseAgent` / `AgentRuntime`, multi-LLM providers, and hybrid cache (local + ElastiCache). What it lacks is **explicit orchestration**: conditional branches, retry loops, human-in-the-loop gates, and shared graph state across steps.

LangGraph fills that gap. LangChain supplies model adapters and tool interfaces; LangGraph supplies the state machine. The generator, detector, and template engine stay deterministic.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Deterministic core (unchanged)                                  │
│  Detection → Rule engine → Generator → Secrets → Rollback        │
└───────────────────────────────┬─────────────────────────────────┘
                                │ AgentContext
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  LangGraph orchestration layer (new)                             │
│  ┌──────────┐   ┌──────────────┐   ┌──────────┐   ┌───────────┐ │
│  │ Recommend│ → │ Security scan│ → │ Auto-fix │ → │ Re-scan   │ │
│  └──────────┘   └──────────────┘   └──────────┘   └───────────┘ │
│       │                │                  │              │       │
│       └────────────────┴──────────────────┴──────────────┘       │
│                         Shared graph state + ElastiCache          │
└─────────────────────────────────────────────────────────────────┘
```

**Bypass rule:** `--no-agent` and `provider: offline` must skip the entire graph and behave exactly as v1.

---

## Task Structure

| Task | Focus | Depends on |
|------|--------|------------|
| Task 1 | Foundation — deps, model bridge, graph state types | — |
| Task 2 | Post-init orchestration graph (recommendation + security) | Task 1 |
| Task 3 | Security remediation loop (scan → fix → re-scan) | Task 2 |
| Task 4 | Pipeline failure diagnosis graph | Task 2 |
| Task 5 | Unified CLI, memory, checkpoints, and release hardening | Tasks 3–4 |

---

## Task 1 — LangGraph Foundation & LLM Bridge

**Goal:** Install LangChain/LangGraph, define shared graph state, and bridge the existing `LLMProvider` abstraction to LangChain chat models without breaking current agents or tests.

**Why first:** Every later graph node will call through this bridge. Provider credentials, timeouts, and offline mode must work before any orchestration is wired.

### Deliverables

1. **Dependencies** (exact versions in `package.json`):
   - `@langchain/core`
   - `@langchain/langgraph`
   - Provider packages as needed: `@langchain/openai`, `@langchain/anthropic`, `@langchain/google-genai`, `@langchain/aws` (or thin custom `BaseChatModel` wrappers where official adapters are insufficient)

2. **`src/agent/graph/types.ts`** — shared state schema:
   ```typescript
   interface DevForgeGraphState {
     context: AgentContext;
     credentials: StoredCredentials;
     recommendationResult: AgentResult | null;
     securityResult: AgentResult | null;
     phase: 'idle' | 'recommend' | 'security' | 'fix' | 'complete' | 'skipped';
     errors: string[];
     metadata: { startedAt: string; graphVersion: number };
   }
   ```

3. **`src/agent/graph/LangChainModelBridge.ts`**
   - `toLangChainChatModel(credentials: StoredCredentials): BaseChatModel | null`
   - Maps each `AgentProviderName` to the correct LangChain model
   - Returns `null` for `offline` (graph should not invoke LLM nodes)
   - Preserves 30s timeout behavior via LangChain `timeout` / `signal` options
   - Reuses credential keys from `CredentialManager` (no duplicate secret storage)

4. **`src/agent/graph/GraphConfig.ts`**
   - `isGraphEnabled(options?: { noAgent?: boolean }): boolean`
   - Reads `DEVFORGE_USE_LANGGRAPH=true` env flag for gradual rollout
   - Default: `false` until Task 2 merges; then default `true` with env opt-out

5. **`src/agent/graph/index.ts`** — barrel exports

6. **Tests:** `tests/agent/graph/LangChainModelBridge.test.ts`
   - Mock each provider; verify bridge returns correct model class
   - Verify `offline` returns `null`
   - Verify credentials are passed through without logging secrets

### Acceptance criteria

- [x] `npm run build` and full Jest suite pass with new deps
- [x] Existing `BaseAgent` + `AgentRuntime` paths unchanged (no regressions)
- [x] Bridge unit-tested for all five online providers + offline
- [x] No LangGraph graph compiled yet — foundation only

### Implementation prompt

```
Add LangChain/LangGraph foundation to DevForge without changing init behavior yet.

Create src/agent/graph/ with types, GraphConfig, and LangChainModelBridge.
Bridge StoredCredentials → BaseChatModel for nova-pro, gemini, openai, anthropic, bedrock.
Offline returns null. Add DEVFORGE_USE_LANGGRAPH env flag (default false).
Add unit tests. Do not wire graphs into CLI yet.
```

---

## Task 2 — Post-Init Orchestration Graph

**Goal:** Replace the sequential `AgentRuntime.runForeground` / `runBackground` calls in init pipelines with a single LangGraph that runs recommendation (foreground) then security (background-capable), while preserving reporters and `--no-agent` bypass.

### Current code to migrate

| File | Current behavior |
|------|------------------|
| `src/cli/recommendationPipeline.ts` | `AgentRuntime.runForeground(RecommendationAgent)` |
| `src/cli/securityPipeline.ts` | `AgentRuntime.runBackground(SecurityComplianceAgent)` |
| `src/cli/initCommand.ts` | Calls both pipelines after generation |

### Deliverables

1. **`src/agent/graph/nodes/recommendationNode.ts`**
   - Wraps `RecommendationAgent.run(context)` as a LangGraph node
   - Input/output: `DevForgeGraphState`
   - Writes `recommendationResult`, sets `phase: 'recommend'`

2. **`src/agent/graph/nodes/securityNode.ts`**
   - Wraps `SecurityComplianceAgent.run(context)` 
   - Uses `SecurityReporter` for formatted output (fix known gap vs generic `printResult`)
   - Sets `phase: 'security'`

3. **`src/agent/graph/postInitGraph.ts`**
   - Compile graph:
     ```
     START → check_enabled → (skip → END) | recommend → security → END
     ```
   - `check_enabled` node: if offline / `--no-agent` / graph disabled → `phase: 'skipped'`, jump to END
   - Security node may run synchronously in graph (background UX via non-blocking logging inside node)

4. **`src/agent/graph/runPostInitGraph.ts`**
   - `runPostInitGraph(context, credentials, options): Promise<DevForgeGraphState>`
   - Creates cache via `createAgentCache(credentials)`
   - Invokes compiled graph with initial state

5. **Update pipelines**
   - `recommendationPipeline.ts` — when `GraphConfig.isGraphEnabled()`, delegate to `runPostInitGraph` for recommendation + report; keep legacy path behind flag
   - `securityPipeline.ts` — remove duplicate agent construction when graph handles security; or call graph tail only if split is needed for timing

6. **Tests:** `tests/agent/graph/postInitGraph.test.ts`
   - Mock agents; verify node order recommend → security
   - Verify skip path when `noAgent: true` or `offline`
   - Verify `ExpectedOutputReporter` still runs when `noReport: false`

### Acceptance criteria

- [x] `devforge init` behavior unchanged from user perspective (same banners, reports)
- [x] `--no-agent` skips entire graph
- [x] `DEVFORGE_USE_LANGGRAPH=false` uses legacy `AgentRuntime` path
- [x] E2E `tests/e2e/agenticInit.test.ts` passes

### Implementation prompt

```
Build post-init LangGraph: recommend → security with skip node for offline/--no-agent.
Wrap existing RecommendationAgent and SecurityComplianceAgent as graph nodes.
Wire into recommendationPipeline.ts and securityPipeline.ts behind DEVFORGE_USE_LANGGRAPH.
Use SecurityReporter in security node. Add graph unit tests and keep legacy fallback.
```

---

## Task 3 — Security Remediation Loop Graph

**Goal:** Add a conditional LangGraph loop for `devforge audit --security --fix`: scan → auto-fix → re-scan until clean, max retries, or user abort — without LLM-generating workflow YAML.

### Current code to extend

| File | Role |
|------|------|
| `src/cli/auditCommand.ts` | `audit --security --fix` entry |
| `src/agent/agents/SecurityComplianceAgent.ts` | Compliance analysis |
| `src/agent/security/AutoFixEngine.ts` | Deterministic fixes |
| `src/agent/security/StaticSecurityScanner.ts` | Offline fallback scans |

### Deliverables

1. **Extend `DevForgeGraphState`** with:
   ```typescript
   fixAttempts: number;
   maxFixAttempts: number; // default 3
   fixedFiles: string[];
   requiresApproval: boolean;
   approved: boolean;
   ```

2. **`src/agent/graph/nodes/staticScanNode.ts`**
   - Runs `StaticSecurityScanner` when LLM unavailable
   - Populates `securityResult` warnings

3. **`src/agent/graph/nodes/autoFixNode.ts`**
   - Calls `AutoFixEngine.applyFixes()` on fixable warnings only
   - Increments `fixAttempts`
   - Never modifies files outside `generatedFiles` / audit scope

4. **`src/agent/graph/nodes/approvalNode.ts`** (human-in-the-loop)
   - When `requiresApproval` and fixes pending: inquirer confirm in interactive mode
   - In CI (`CI=true`): skip auto-fix unless `--yes` flag added to audit command

5. **`src/agent/graph/securityRemediationGraph.ts`**
   ```
   START → scan → has_fixable_issues?
     → no  → END
     → yes → approval (if needed) → auto_fix → scan (loop if attempts < max)
   ```

6. **Update `auditCommand.ts`**
   - `--security --fix` uses `securityRemediationGraph` when graph enabled
   - Add `--yes` to auto-approve fixes in CI

7. **Fix `SecurityComplianceAgent.fallback()`** to return static-scan results (known gap from Phase 3 audit)

8. **Tests:** `tests/agent/graph/securityRemediationGraph.test.ts`, update `tests/cli/audit*.test.ts`

### Acceptance criteria

- [x] `devforge audit --security` works without `--fix` (single scan, no loop)
- [x] `devforge audit --security --fix` loops up to 3 times then stops with summary
- [x] Offline mode uses static scanner path in graph
- [x] No LLM writes to disk — only `AutoFixEngine` applies file changes

### Implementation prompt

```
Build security remediation LangGraph: scan → approval → auto_fix → re-scan (max 3).
Wire into audit --security --fix. Add --yes for CI. Fix SecurityComplianceAgent.fallback()
to use StaticSecurityScanner. Human approval via inquirer when interactive.
```

---

## Task 4 — Pipeline Failure Diagnosis Graph

**Goal:** Orchestrate post-failure intelligence: ingest CI signals, run `PipelineFailureDetector`, enrich with LLM recommendations, and persist actionable items — as a reusable graph invokable from init, audit, and a future `devforge diagnose` command.

### Current code to integrate

| File | Role |
|------|------|
| `src/agent/PipelineFailureDetector.ts` | Rule-based failure signals |
| `src/agent/RecommendationStore.ts` | Persist recommendations |
| `src/agent/reporters/ExpectedOutputReporter.ts` | Expected pipeline output |
| `src/cli/recommendationPipeline.ts` | Init-time analysis |

### Deliverables

1. **Extend `DevForgeGraphState`** with:
   ```typescript
   failureSignals: FailureSignal[];
   lastRunJson: LastRunJson | null;
   storedRecommendationIds: string[];
   ```

2. **`src/agent/graph/nodes/detectFailuresNode.ts`**
   - Calls `detectLikelyFailures(config, fs)`
   - Short-circuits if no signals and no `last-run.json`

3. **`src/agent/graph/nodes/enrichRecommendationsNode.ts`**
   - Runs `RecommendationAgent` only when signals exist or last run indicates failure
   - Saves to `RecommendationStore`
   - Deduplicates against dismissed recommendations

4. **`src/agent/graph/nodes/reportExpectedOutputsNode.ts`**
   - Runs `ExpectedOutputReporter.report()`

5. **`src/agent/graph/pipelineDiagnosisGraph.ts`**
   ```
   START → load_last_run → detect_failures → (signals?)
     → no  → report_expected → END
     → yes → enrich_recommendations → report_expected → END
   ```

6. **`src/cli/diagnoseCommand.ts`** (new)
   - `devforge diagnose` — runs diagnosis graph on current project without regenerating files
   - Options: `--no-agent`, `--json` (machine-readable output)

7. **Refactor `recommendationPipeline.ts`**
   - Init flow calls `pipelineDiagnosisGraph` instead of inline agent + reporter logic when graph enabled

8. **Tests:** `tests/agent/graph/pipelineDiagnosisGraph.test.ts`, `tests/cli/diagnoseCommand.test.ts`

### Acceptance criteria

- [x] `devforge diagnose` runs on a project with `.devforge/last-run.json` and prints recommendations
- [x] Init still runs diagnosis as part of post-init flow
- [x] Dismissed recommendations are not re-surfaced
- [x] `--json` output is stable and documented

### Implementation prompt

```
Build pipeline failure diagnosis LangGraph: load last run → detect failures →
conditionally run RecommendationAgent → ExpectedOutputReporter.
Add devforge diagnose command. Refactor recommendationPipeline to use this graph.
Support --json and respect RecommendationStore dismissals.
```

---

## Task 5 — Unified Orchestration, Memory, CLI & Release Hardening

**Goal:** Compose post-init, security, and diagnosis subgraphs into one top-level DevForge graph; add checkpointing, ElastiCache-backed graph state, CLI observability, and flip LangGraph to default-on for v2.1 release.

### Deliverables

1. **`src/agent/graph/devForgeGraph.ts`** — master graph composing:
   - Subgraph: `postInitGraph` (Task 2)
   - Subgraph: `pipelineDiagnosisGraph` (Task 4) — can run in parallel with security background work where safe
   - Optional invoke: `securityRemediationGraph` (Task 3) when `audit --security --fix` is triggered separately

2. **`src/agent/graph/checkpointing.ts`**
   - In-memory checkpointer for tests
   - ElastiCache checkpointer adapter (key prefix `devforge:graph:`) when ElastiCache configured
   - Fallback: local file `~/.devforge/graph-checkpoints.json`

3. **`src/agent/graph/GraphMemory.ts`**
   - Store per-project namespace: hash of git remote URL or absolute `projectRoot`
   - Persist: last graph run, recommendation IDs acted on, security scan summary
   - Aligns with Phase 5 memory plan (ElastiCache / future Elasticsearch)

4. **CLI commands**
   - `devforge agent graph status` — last run phase, node timings, cache hit rate
   - `devforge agent graph reset` — clear checkpoints for current project
   - Update `--help` Agent Commands section

5. **Configuration**
   - `DEVFORGE_USE_LANGGRAPH` default → `true`
   - `DEVFORGE_GRAPH_MAX_FIX_ATTEMPTS` (default `3`)
   - Document all env vars in `docs/AGENT_GRAPH.md`

6. **Observability**
   - Structured log lines per node: `[graph:recommend] completed in 1.2s`
   - Respect `--timing` / `--verbose` from init for graph spans

7. **Release**
   - Bump minor version (v2.1.0)
   - CHANGELOG entry for LangGraph orchestration
   - Coverage: graph modules ≥ 80%

8. **Tests**
   - `tests/agent/graph/devForgeGraph.integration.test.ts` — full init mock path
   - `tests/e2e/agenticInit.test.ts` — run with `DEVFORGE_USE_LANGGRAPH=true`
   - Deprecation note in `AgentRuntime` JSDoc (kept for backward compat, not removed)

### Acceptance criteria

- [x] Single `devForgeGraph` invoked from `initCommand` when agents enabled
- [x] `devforge agent graph status` shows last run metadata
- [x] Checkpoints survive process restart when ElastiCache or local fallback configured
- [x] `DEVFORGE_USE_LANGGRAPH=false` still supported for one release cycle
- [x] All 632+ existing tests pass; new graph tests added
- [x] `docs/AGENT_GRAPH.md` complete

### Implementation prompt

```
Compose Task 2–4 subgraphs into devForgeGraph with checkpointing (ElastiCache + local).
Add devforge agent graph status|reset. Default DEVFORGE_USE_LANGGRAPH=true.
Add docs/AGENT_GRAPH.md, CHANGELOG, integration tests. Keep AgentRuntime as legacy fallback.
```

---

## Cross-Cutting Rules (All Tasks)

1. **Never LLM-generate** workflow YAML, Dockerfiles, or K8s manifests — tools may only call existing generators and `AutoFixEngine`.
2. **`--no-agent`** must bypass LangGraph entirely; init must complete with v1-quality output.
3. **Credentials** flow only through `CredentialManager` and existing env vars — no new secret files.
4. **Cache** — graph nodes must use `createAgentCache(credentials)`; no duplicate Redis clients.
5. **CI** — all graphs must pass with `CI=true` (offline credentials, no inquirer prompts unless `--yes`).
6. **Bundle size** — tree-shake LangChain imports; avoid pulling unused provider SDKs into dist.

---

## Suggested Implementation Order

```
Task 1  →  Task 2  →  Task 3
                  ↘  Task 4  ↗
                        ↓
                     Task 5
```

Tasks 3 and 4 can be done in parallel after Task 2 is complete. Task 5 requires both.

---

## File Tree (after all tasks)

```
src/agent/graph/
  index.ts
  types.ts
  GraphConfig.ts
  LangChainModelBridge.ts
  checkpointing.ts
  GraphMemory.ts
  postInitGraph.ts
  securityRemediationGraph.ts
  pipelineDiagnosisGraph.ts
  devForgeGraph.ts
  runPostInitGraph.ts
  nodes/
    recommendationNode.ts
    securityNode.ts
    staticScanNode.ts
    autoFixNode.ts
    approvalNode.ts
    detectFailuresNode.ts
    enrichRecommendationsNode.ts
    reportExpectedOutputsNode.ts
    checkEnabledNode.ts

src/cli/
  diagnoseCommand.ts          # Task 4
  graphCommand.ts             # Task 5

docs/
  AGENT_GRAPH.md              # Task 5

tests/agent/graph/
  LangChainModelBridge.test.ts
  postInitGraph.test.ts
  securityRemediationGraph.test.ts
  pipelineDiagnosisGraph.test.ts
  devForgeGraph.integration.test.ts
```

---

## References

- Existing plan: `DevForge_Agentic_Implementation_Plan_v2.md`
- Agent runtime: `src/agent/AgentRuntime.ts`, `src/agent/BaseAgent.ts`
- Init orchestration: `src/cli/initCommand.ts`
- Pipelines: `src/cli/recommendationPipeline.ts`, `src/cli/securityPipeline.ts`
- LangGraph JS docs: https://langchain-ai.github.io/langgraphjs/
