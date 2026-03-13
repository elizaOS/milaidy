# Solo vs Swarm Replay Benchmark Runbook

Date: 2026-03-11

## Goal
Compare quality/cost footprints across:
- solo agent run
- swarm run (baseline)
- swarm run with reflection-aware extraction behavior

using a single normalized replay pipeline.

## 0. Preflight (isolate Python deps)
Run before each capture so global Python packages do not skew timings.

Cold (fresh env, recommended for apples-to-apples):
```bash
bun run benchmark:preflight -- \
  --workspace ~/.milady/workspaces/<workspace-id> \
  --mode cold
```

Warm (reuse existing benchmark venv):
```bash
bun run benchmark:preflight -- \
  --workspace ~/.milady/workspaces/<workspace-id> \
  --mode warm
```

If you want your current shell to use the benchmark venv PATH:
```bash
eval "$(bun run benchmark:preflight -- \
  --workspace ~/.milady/workspaces/<workspace-id> \
  --mode cold \
  --shell-export)"
```

## 1. Capture runs
For each mode, run the same prompt and capture debug output with:
- `PARALLAX_DEBUG_CAPTURE=1`

Suggested output layout:
- `captures/solo/`
- `captures/swarm-baseline/`
- `captures/swarm-reflection/`

## 2. Normalize captures
Use Milady normalizer to convert raw capture JSON into replay artifacts:

```bash
bun run benchmark:normalize-capture -- --input captures/solo --output replays/solo --glob "*.json"
bun run benchmark:normalize-capture -- --input captures/swarm-baseline --output replays/swarm-baseline --glob "*.json"
bun run benchmark:normalize-capture -- --input captures/swarm-reflection --output replays/swarm-reflection --glob "*.json"
```

Each normalized file is emitted as `*.replay.json`.

## 3. Score replay sets in benchmarks orchestrator
From `<path-to-your-workspaces>/benchmarks` on branch `shaw/benchmark-orchestrator-viewer`:

```bash
python -m benchmarks.orchestrator run \
  --benchmarks milady_replay \
  --provider openai \
  --model gpt-4o-mini \
  --extra '{"per_benchmark":{"milady_replay":{"capture_path":"<path-to-your-workspaces>/milaidy/replays/solo","capture_glob":"*.replay.json"}}}'

python -m benchmarks.orchestrator run \
  --benchmarks milady_replay \
  --provider openai \
  --model gpt-4o-mini \
  --extra '{"per_benchmark":{"milady_replay":{"capture_path":"<path-to-your-workspaces>/milaidy/replays/swarm-baseline","capture_glob":"*.replay.json"}}}'

python -m benchmarks.orchestrator run \
  --benchmarks milady_replay \
  --provider openai \
  --model gpt-4o-mini \
  --extra '{"per_benchmark":{"milady_replay":{"capture_path":"<path-to-your-workspaces>/milaidy/replays/swarm-reflection","capture_glob":"*.replay.json"}}}'
```

## 4. Compare metrics
Use `benchmark_results/viewer_data.json` and `orchestrator.sqlite` to compare:
- `success_rate`
- `avg_event_count`
- `avg_llm_event_count`
- `avg_tool_event_count`
- `avg_decision_event_count`
- `avg_duration_ms`

## Notes
- Replay benchmarking is deterministic on artifacts; generation-time non-determinism is isolated to the capture stage.
- Keep capture prompt and repo state as constant as possible across modes.
