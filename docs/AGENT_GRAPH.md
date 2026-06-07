# DevForge Agent Graph (LangGraph)

DevForge v2.1 orchestrates agent workflows with [LangGraph](https://langchain-ai.github.io/langgraphjs/). The deterministic generator is unchanged; graphs coordinate recommendation, security, and remediation agents.

## Enable / disable

| Variable | Default | Description |
|----------|---------|-------------|
| `DEVFORGE_USE_LANGGRAPH` | enabled | Set to `false` to use legacy `AgentRuntime` |
| `DEVFORGE_GRAPH_MAX_FIX_ATTEMPTS` | `3` | Max scan → fix loops for `audit --security --fix` |

## Graphs

### `devForgeGraph` (init / update)

Invoked after `devforge init` when agents are enabled:

```
check_enabled → load_last_run → detect_failures
  → enrich_recommendations (if signals) → security → report_expected → persist_memory
```

### `pipelineDiagnosisGraph` (`devforge diagnose`)

```
load_last_run → detect_failures → enrich_recommendations? → report_expected
```

### `securityRemediationGraph` (`devforge audit --security --fix`)

```
scan → approval → auto_fix → scan (loop, max attempts)
```

## CLI

```bash
devforge diagnose              # Run failure diagnosis
devforge diagnose --json       # Machine-readable output
devforge diagnose --no-agent   # Deterministic signals only

devforge audit --security      # Single compliance scan
devforge audit --security --fix --yes   # Remediation loop (CI-safe)

devforge agent graph status    # Last run metadata + checkpoint state
devforge agent graph reset     # Clear project graph memory
```

## Persistence

| Store | Location |
|-------|----------|
| Graph memory | `.devforge/graph-memory.json` (per project) |
| Checkpoints (local) | `~/.devforge/graph-checkpoints.json` |
| Checkpoints (cloud) | ElastiCache prefix `devforge:graph:` when configured |

## Offline / CI

- `--no-agent` bypasses all graphs.
- `provider: offline` skips LLM nodes; static security scanner is used.
- In CI, `audit --security --fix` requires `--yes` for auto-fix approval.
