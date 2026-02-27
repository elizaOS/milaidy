---
title: Contributing Guide
description: How to set up a development environment, follow code conventions, and submit pull requests to the MiladyAI project.
---

# Contributing Guide

Welcome to MiladyAI! This guide will help you set up your development environment and contribute effectively.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Environment](#development-environment)
3. [Project Structure](#project-structure)
4. [Building and Testing](#building-and-testing)
5. [Code Style](#code-style)
6. [Pull Request Process](#pull-request-process)
7. [Community](#community)

---

## Getting Started

### Prerequisites

- **Node.js 22 LTS** — Required runtime (`.nvmrc` is pinned)
- **Bun** — Package manager/runtime used by repo scripts
- **Git** — Version control

### Quick Setup

```bash
# Clone the repository
git clone https://github.com/milady-ai/milady.git
cd milady

# Match repository Node version
nvm use || nvm install
node -v  # expected: v22.22.0

# Install dependencies
bun install

# Build the project
bun run build

# Run in development mode
bun run dev
```

---

## Development Environment

### Required Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 22.x LTS | Runtime |
| Bun | Latest | Package management + script runner |
| Git | Latest | Version control |

### Optional Tools

| Tool | Purpose |
|------|---------|
| pnpm | Optional package manager for non-repo workflows |
| Docker | Container testing |
| VS Code | Recommended editor |

### Editor Setup

**VS Code Extensions:**
- ESLint
- Prettier
- TypeScript
- Biome (for formatting)

**Settings (.vscode/settings.json):**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "biomejs.biome",
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

---

## Project Structure

```
milady/
├── apps/
│   ├── app/                 # Desktop/mobile app (Capacitor + React)
│   │   ├── electron/        # Electron desktop wrapper
│   │   ├── src/             # React UI components
│   │   └── test/            # App tests
│   └── chrome-extension/    # Browser extension
├── deploy/                  # Docker deployment configs
├── docs/                    # Documentation
│   └── guides/              # Developer guides (you are here)
├── packages/
│   ├── mldy/                # MLDY package
│   ├── plugin-ui/           # UI plugin system
│   └── psyop/               # PSYOP package
├── scripts/                 # Build and dev tooling
├── skills/                  # Skill cache
├── src/                     # Core source code
│   ├── actions/             # Agent actions
│   ├── api/                 # HTTP API routes
│   ├── cli/                 # CLI commands
│   ├── config/              # Configuration handling
│   ├── emotes/              # Avatar emote system
│   ├── hooks/               # Runtime hooks
│   ├── permissions/         # Permission system
│   ├── plugins/             # Built-in plugins
│   ├── providers/           # Context providers
│   ├── runtime/             # ElizaOS runtime wrapper
│   ├── security/            # Security utilities
│   ├── services/            # Background services
│   ├── shared/              # Shared utilities
│   ├── terminal/            # Terminal integration
│   ├── triggers/            # Trigger system
│   ├── tui/                 # Terminal UI
│   └── utils/               # Helper utilities
├── test/                    # Test setup, helpers, e2e
├── AGENTS.md                # Repository guidelines
├── README.md                # Project overview
├── package.json             # Root package config
├── plugins.json             # Plugin registry manifest
├── tsconfig.json            # TypeScript config
└── tsdown.config.ts         # Build config
```

### Key Entry Points

| File | Purpose |
|------|---------|
| `src/entry.ts` | CLI entry point |
| `src/index.ts` | Library exports |
| `src/runtime/eliza.ts` | ElizaOS runtime initialization |
| `src/runtime/milady-plugin.ts` | Main MiladyAI plugin |
| `milady.mjs` | npm bin entry |

---

## Building and Testing

### Build Commands

```bash
# Full build (TypeScript + UI)
bun run build

# TypeScript only
bun run build:node

# Desktop app (Electron)
bun run build:desktop

# Mobile (Android)
bun run build:android

# Mobile (iOS)
bun run build:ios
```

### Development Mode

```bash
# Run with auto-reload on changes
bun run dev

# Run CLI directly (via tsx)
bun run milady start

# UI development only
bun run dev:ui

# Desktop app development
bun run dev:desktop

# Terminal UI
bun run tui
```

### Testing

Coverage thresholds are enforced in `vitest.config.ts`: 25% lines/functions/statements, 15% branches. CI fails when coverage falls below these floors.

```bash
# Run all tests (parallel)
bun run test

# Run with coverage (enforces thresholds)
bun run test:coverage

# Watch mode
bun run test:watch

# End-to-end tests
bun run test:e2e

# Live tests (requires API keys)
MILADY_LIVE_TEST=1 bun run test:live

# Docker-based tests
bun run test:docker:all
```

### Runtime fallback for Bun crashes

If Bun segfaults on your platform during long-running sessions, run Milady on Node runtime:

```bash
MILADY_RUNTIME=node bun run milady start
```

### Test File Conventions

| Pattern | Purpose |
|---------|---------|
| `*.test.ts` | Unit tests (colocated with source) |
| `*.e2e.test.ts` | End-to-end tests |
| `*.live.test.ts` | Live API tests |
| `test/**/*.test.ts` | Integration tests |

---

## Code Style

### TypeScript Guidelines

- **Strict mode** — Always use strict TypeScript
- **Avoid `any`** — Use proper types or `unknown`
- **ESM** — Use ES modules (`import`/`export`)
- **Async/await** — Prefer over raw promises

### Naming Conventions

| Item | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `my-feature.ts` |
| Classes | PascalCase | `MyService` |
| Functions | camelCase | `processMessage` |
| Constants | UPPER_SNAKE | `MAX_RETRIES` |
| Actions | UPPER_SNAKE | `RESTART_AGENT` |
| Types/Interfaces | PascalCase | `PluginConfig` |

### Product vs Code Naming

- **MiladyAI** — Product name, headings, docs
- **milady** — CLI command, package name, paths, config keys

### Formatting

The project uses **Biome** for formatting and linting:

```bash
# Check formatting and lint
bun run check

# Fix formatting issues
bun run format:fix

# Fix lint issues
bun run lint:fix
```

### File Size

Aim to keep files under **~500 lines**. Split when it improves:
- Clarity
- Testability
- Reusability

### Comments

```typescript
// ✅ Explain WHY, not WHAT
// Rate limit to avoid API throttling during batch operations
const BATCH_DELAY_MS = 100;

// ❌ Don't explain obvious code
// Increment counter by 1
counter++;
```

### Error Handling

```typescript
// ✅ Specific error types with context
throw new Error(`Failed to load plugin "${name}": ${err.message}`);

// ✅ Graceful degradation
try {
  await riskyOperation();
} catch (err) {
  runtime.logger?.warn({ err, context }, "Operation failed, using fallback");
  return fallbackValue;
}

// ❌ Silent swallowing
try {
  await something();
} catch {}
```

---

## Pull Request Process

### Branch Strategy

| Branch | Purpose | Deploys to |
|--------|---------|------------|
| `main` | Stable releases | Production (npm) |
| `develop` | Integration branch | Alpha/staging |
| `feature/*` | New features | — |
| `fix/*` | Bug fixes | — |

### Creating a PR

1. **Fork and clone** (or branch from develop)
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/my-feature
   ```

2. **Make changes** with meaningful commits
   ```bash
   git add .
   git commit -m "feat: add new action for X"
   ```

3. **Run checks before pushing**
   ```bash
   bun run check
   bun run test
   ```

4. **Push and create PR**
   ```bash
   git push origin feature/my-feature
   # Then open PR on GitHub
   ```

### Commit Message Format

Use conventional commits:

```
<type>: <description>

[optional body]

[optional footer]
```

**Types:**
- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation
- `refactor:` — Code refactoring
- `test:` — Test additions/changes
- `chore:` — Build, deps, configs

**Examples:**
```
feat: add voice message support to telegram connector

fix: prevent crash when config file is missing

docs: add plugin development guide

refactor: extract session key logic to provider

chore: update @elizaos/core to 2.0.0-alpha.4
```

### PR Checklist

Before submitting:

- [ ] Code builds without errors (`bun run build`)
- [ ] Tests pass (`bun run test`)
- [ ] Linting passes (`bun run check`)
- [ ] New code has tests (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Commit messages follow conventions
- [ ] PR description explains the change

### Code Review

PRs are reviewed by maintainers. Expect feedback on:

- **Correctness** — Does it work?
- **Design** — Is the approach sound?
- **Style** — Does it follow conventions?
- **Tests** — Is it adequately tested?
- **Docs** — Is it documented?

Claude Code Review is enabled for automated initial feedback.

---

## Community

### Discord

Join the community Discord for help, discussions, and announcements:

**[discord.gg/ai16z](https://discord.gg/ai16z)**

Channels:
- `#milady` — MiladyAI-specific discussion
- `#dev` — Development help
- `#showcase` — Share what you've built

### GitHub

- **Issues** — Bug reports, feature requests
- **Discussions** — Questions, ideas, RFC
- **PRs** — Code contributions

### Reporting Issues

When filing an issue:

1. **Check existing issues** — Avoid duplicates
2. **Use templates** — Fill out the provided template
3. **Include reproduction** — Steps to reproduce
4. **Share logs** — Relevant error output
5. **Environment** — OS, Node version, MiladyAI version

```markdown
## Bug Report

**Describe the bug:**
Brief description

**To reproduce:**
1. Run `milady start`
2. Send message "..."
3. Error occurs

**Expected behavior:**
What should happen

**Environment:**
- OS: macOS 14.2
- Node: 22.12.0
- MiladyAI: 2.0.0-alpha.8

**Logs:**
```
[error output here]
```
```

---

## Getting Help

- **Discord** — Fastest response for questions
- **GitHub Issues** — Bug reports and features
- **Documentation** — Check `/docs` first
- **AGENTS.md** — Repository-specific guidelines

---

## Next Steps

- [Plugin Development Guide](/plugins/development) — Build plugins
- [Skills Documentation](/plugins/skills) — Create skills
- [Local Plugin Development](/plugins/local-plugins) — Develop locally
- Browse the codebase: start with `src/runtime/milady-plugin.ts`
