# Parallax Replay Capture Contract

Date: 2026-03-11

## Purpose
Define one canonical artifact shape for swarm run captures so benchmark replay is stable even when raw debug output changes between runs.

## Canonical Artifact
- Module: `src/benchmark/replay-capture.ts`
- Entry function: `normalizeParallaxCapture(input)`
- Output schema: `ReplayArtifactSchema`

Top-level fields:
- `schema_version`: `"1.0"`
- `source`: `"parallax_debug_capture"`
- `run`: run metadata (`run_id`, `captured_at`, `mode`, `prompt`, `repo`, `workdir`)
- `orchestrator`: orchestrator session identifiers (`session_id`, `task_label`)
- `events[]`: normalized event stream
- `outcome`: (`success`, `status`, `summary`)

## Event Normalization
Each event is normalized to:
- `id`, `ts`, `actor`, `kind`, `message`
- optional `decision_type`
- optional `tool_call` (`name`, `input`, `output`)
- optional `llm` (`model`, `prompt`, `response`, token fields, latency)
- `raw` (original record for debugging/backfill)

## Accepted Input Shapes
`normalizeParallaxCapture` accepts:
- wrapped object forms with `events`, `records`, `trace`, `entries`, or `steps`
- bare arrays of event-like records

## Capture Workflow
1. Enable `PARALLAX_DEBUG_CAPTURE`.
2. Run one coding task (solo or swarm).
3. Feed raw capture JSON into `normalizeParallaxCapture`.
4. Persist normalized output as the benchmark replay artifact.
5. Replay only from normalized artifacts in benchmark runs.

## Why This Matters
- Replays become comparable across runs despite non-determinism.
- Benchmark harness depends on a stable schema, not ad-hoc logs.
- We can add stricter quality/cost metrics against this event contract.
