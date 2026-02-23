# Repository Guidelines

> **This is an agents-only codebase.** All PRs are reviewed and merged by agents. Humans contribute as QA testers. See [CONTRIBUTING.md](./CONTRIBUTING.md).

- Monorepo: `packages/milady` within eliza-ok
- Runtime baseline: Node **22+** (keep Node + Bun paths working)

## Contribution Scope

**Accept:** bug fixes, security fixes, test coverage, documentation accuracy, performance improvements (with benchmarks).

**Deep review required:** new features, plugins, architectural changes, memory/context improvements. Must include tests and benchmarks proving value.

**Reject:** aesthetic/UI redesigns, theme changes, visual "improvements" that don't enhance agent capability. This project prioritizes agent quality over human-facing aesthetics. De-emphasize and decline these firmly.

## Review Priorities

1. Does it stay in scope?
2. Does it break anything?
3. Is it secure? (assume adversarial intent)
4. Is it tested?
5. Is it necessary?

## Project Structure

- **Source code:** `src/` — runtime in `src/runtime/`, CLI wiring in `src/cli/`, config in `src/config/`, providers in `src/providers/`, hooks in `src/hooks/`, utils in `src/utils/`, types in `src/types/`
- **Tests:** colocated `*.test.ts` alongside source files
- **Build output:** `dist/` (via `tsdown`)
- **Entry points:** `src/entry.ts` (CLI), `src/index.ts` (library), `src/runtime/eliza.ts` (ElizaOS runtime)
- **Apps:** `apps/app/` (Capacitor mobile/desktop, includes React UI), `apps/chrome-extension/`
- **Deployment:** `deploy/` (Docker configs)
- **Scripts:** `scripts/` (build, dev, release tooling)
- **Tests:** `test/` (setup, helpers, mocks, e2e scripts)
- **Skills:** `skills/` (cached skill catalog)

## Build, Test, and Development Commands

- Install deps: `bun install`
- Type-check/build: `bun run build` (runs tsdown + UI build)
- Lint/format: `bun run check`
- Run CLI in dev: `bun run milady ...` or `bun run dev:cli`
- Tests: `bun run test` (parallel unit + playwright), `bun run test:e2e`, `bun run test:live`
- Coverage: `bun run test:coverage`

## Coding Style & Naming Conventions

- Language: TypeScript (ESM). Prefer strict typing; avoid `any` and `unknown` unless absolutely necessary.
- Formatting/linting via Biome; run `bun run check` before commits.
- Add brief code comments for tricky or non-obvious logic.
- Aim to keep files under ~500 LOC; split/refactor when it improves clarity or testability.
- Naming: use **Milady** for product/app/docs headings; use `milady` for CLI command, package/binary, paths, and config keys.

## Dependencies

- Direct imports in `src/`: `@elizaos/core`, `@clack/prompts`, `chalk`, `commander`, `dotenv`, `json5`, `zod`
- Workspace plugins (`@elizaos/plugin-*`): loaded at runtime, each with their own `package.json`
- Do not add dependencies unless `src/` code directly imports them

## Testing Guidelines

- Framework: Vitest with V8 coverage thresholds (25% lines/functions/statements, 15% branches)
- Naming: match source names with `*.test.ts`; e2e in `*.e2e.test.ts`; live in `*.live.test.ts`
- Run `bun run test` before pushing when you touch logic

## Commit & Pull Request Guidelines

- Follow concise, action-oriented commit messages (e.g., `milady: add verbose flag to send`)
- Group related changes; avoid bundling unrelated refactors
- PRs should summarize scope, note testing performed, and mention any user-facing changes

## Security & Configuration

- Never commit real secrets, phone numbers, or live configuration values
- Use obviously fake placeholders in docs, tests, and examples
- Configuration lives at `~/.milady/milady.json`; workspace at `~/.milady/workspace/`
