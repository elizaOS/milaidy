# Contributing to Milady

Thank you for your interest in contributing! This document provides quick guidelines. For detailed instructions, see [docs/guides/contributing.md](./docs/guides/contributing.md).

## Quick Start

```bash
# Clone and setup
git clone https://github.com/milady-ai/milady.git
cd milady
bun install
bun run build
```

## Development Workflow

1. Create a feature branch from `develop`
2. Make changes with meaningful commits
3. Run checks before pushing:
   ```bash
   bun run check    # Lint/format
   bun run test     # Run tests
   ```
4. Open a PR against `develop`

## Testing Requirements

Coverage thresholds are enforced: 25% for lines, functions, and statements, and 15% for branches. CI fails when coverage falls below these floors.

```bash
bun run test           # Run all tests
bun run test:coverage  # Run with coverage enforcement
bun run test:e2e       # End-to-end tests
```

## Code Style

- TypeScript strict mode
- Biome for formatting/linting
- Conventional commit messages
- Keep files under ~500 LOC

## PR Process

- PRs target `develop` branch
- Must pass CI checks
- Reviewed by maintainers and Claude Code Review

## Getting Help

- Discord: [discord.gg/ai16z](https://discord.gg/ai16z)
- GitHub Issues for bugs/features
- See [AGENTS.md](./AGENTS.md) for repo guidelines
