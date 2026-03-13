# Orchestrator Trajectory + Benchmark Plan

Date: 2026-03-11

## Goal
Preserve full training-quality trajectory data while reducing hot-path context bloat and avoiding duplicate reflection costs in swarm orchestration.

## Current State (Code-Verified)
- Full prompts/responses are persisted for LLM calls (no write-time truncation of model IO): `src/runtime/trajectory-persistence.ts`.
- Insight markers are extracted from full response text and stored in `metadata.insights` for cheap list-time reads: `src/runtime/trajectory-persistence.ts`.
- Observation extraction is gated:
  - explicit setting `TRAJECTORY_OBSERVATION_EXTRACTION` overrides behavior
  - otherwise disabled when `REFLECTION` or `RELATIONSHIP_EXTRACTION` evaluators are present
  - implementation: `shouldRunObservationExtraction(...)` in `src/runtime/trajectory-persistence.ts`.
- TTL pruning writes full raw rows to compressed local sidecar archive (`.jsonl.gz`) before deleting old rows.
- `trajectory_archive` keeps lightweight summary rows plus `archive_blob_path` pointer to compressed raw data.

## Coworker Feedback -> Status
1. "Training data must be complete"
- Status: Addressed.
- Evidence: full `systemPrompt`, `userPrompt`, `response` are saved in trajectory calls.

2. "Reasoning tracing from OSS/open models too"
- Status: Partially addressed.
- Evidence: decision/insight extraction exists; no benchmark proof yet across model families.

3. "Insights cost/complexity risk"
- Status: Partially addressed.
- Evidence: reflection/relationship evaluator guard prevents duplicate extraction by default.
- Gap: no measured cost-vs-quality report yet.

4. "Don't duplicate Eliza reflection evaluator"
- Status: Partially addressed.
- Evidence: guard present in trajectory persistence path.
- Gap: need swarm-path validation in orchestrated runs.

5. "Benchmark against alternatives"
- Status: Not addressed yet.
- Evidence: benchmark branch identified (`shaw/benchmark-orchestrator-viewer`) but Milady adapter/replay path not wired.

6. "Potential adjacent compressed storage"
- Status: Addressed.
- Evidence: compressed sidecar archive with archive-path pointer implemented.

## Benchmark Direction
- Local benchmarks clone exists: `<path-to-your-workspaces>/benchmarks`.
- Relevant branch confirmed: `shaw/benchmark-orchestrator-viewer`.
- This branch includes orchestrator runner, lifecycle scenarios, and viewer components that are aligned with swarm evaluation.

## Next Execution Steps
1. Swarm reflection integration validation
- Add tests that assert observation extraction behavior in orchestrated/swarm runs when reflection evaluators are active.
- Add config-matrix coverage for explicit enable/disable overrides.

2. Capture -> replay harness
- Define canonical artifact shape from `PARALLAX_DEBUG_CAPTURE` outputs.
- Build replay adapter so same captured run can be replayed in benchmark suite.

3. Milady benchmark adapter work
- Check out benchmark branch and adapt orchestrator runner inputs/outputs to Milady swarm records.
- Ensure deterministic-ish replay mode (fixed seed/config where possible).

4. Metrics and acceptance gates
- Required metrics: task success, latency, total tokens, context footprint, extraction cost, observation precision/recall, data completeness.
- Compare modes: solo, swarm-baseline, swarm+reflection-aware extraction.

5. Decide defaults
- Choose production default based on benchmark results.
- Keep explicit override setting for exceptions.

## Immediate Test Delta Added Today
- Expanded `shouldRunObservationExtraction` coverage with:
  - default behavior when no evaluators are present
  - invalid explicit setting fallback behavior
- File: `src/runtime/trajectory-persistence.test.ts`.
