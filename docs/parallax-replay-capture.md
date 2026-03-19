# Parallax Replay Capture

This document describes the replay capture architecture used by the coding
agent benchmark flow.

## Purpose

Replay capture exists to make agent runs inspectable and reproducible without
keeping heavyweight runtime state in hot storage.

It supports:

- Debugging a single run by inspecting PTY event streams.
- Building normalized replay fixtures for benchmark comparisons.
- Comparing orchestration modes (`solo`, `swarm-baseline`, `swarm-reflection`)
  against the same task inputs.

## Data Flow

1. Capture raw PTY sessions with `PARALLAX_DEBUG_CAPTURE=1`.
2. Store per-session artifacts under `.parallax/pty-captures/`:
   - `*.raw-events.jsonl`
   - `*.states.jsonl`
   - `*.transitions.jsonl`
   - `*.lifecycle.jsonl`
3. Normalize captures into benchmark inputs/outputs for replay tooling.
4. Run replays and compare metrics (quality, completion, timing).

Implementation source:

- `src/benchmark/replay-capture.ts`

## Operational Notes

- Captures can include sensitive prompt/context/tool output data.
- Keep capture enabled only while collecting benchmark/debug data.
- Remove or archive old capture artifacts to control local disk growth.

## Related Docs

- `docs/solo-vs-swarm-replay-benchmark-runbook.md`
- `docs/guides/coding-swarms.md`
