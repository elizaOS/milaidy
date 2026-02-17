# Contributing Guide

Welcome to Milaidy! This guide will help you set up your development environment and contribute effectively.

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

- **Node.js 22+** — Required runtime
- **pnpm** — Package manager (recommended)
- **Git** — Version control

### Quick Setup

```bash
# Clone the repository
git clone https://github.com/milady-ai/milaidy.git
cd milaidy

# Install dependencies
pnpm install

# Build the project
pnpm build

# Run in development mode
pnpm dev
```

---

## Development Environment

### Required Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | ≥22.12.0 | Runtime |
| pnpm | Latest | Package management |
| Git | Latest | Version control |

### Optional Tools

| Tool | Purpose |
|------|---------|
| Bun | Alternative runtime (faster) |
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
milaidy/
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
| `src/runtime/milaidy-plugin.ts` | Main Milaidy plugin |
| `milaidy.mjs` | npm bin entry |

---

## Building and Testing

### Build Commands

```bash
# Full build (TypeScript + UI)
pnpm build

# TypeScript only
pnpm build:node

# Desktop app (Electron)
pnpm build:desktop

# Mobile (Android)
pnpm build:android

# Mobile (iOS)
pnpm build:ios
```

### Development Mode

```bash
# Run with auto-reload on changes
pnpm dev

# Run CLI directly (via tsx)
pnpm milaidy start

# UI development only
pnpm dev:ui

# Desktop app development
pnpm dev:desktop

# Terminal UI
pnpm tui
```

### Testing

```bash
# Run all tests (parallel)
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch

# End-to-end tests
pnpm test:e2e

# Live tests (requires API keys)
MILAIDY_LIVE_TEST=1 pnpm test:live

# Docker-based tests
pnpm test:docker:all
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

- **Milaidy** — Product name, headings, docs
- **milaidy** — CLI command, package name, paths, config keys

### Formatting

The project uses **Biome** for formatting and linting:

```bash
# Check formatting and lint
pnpm check

# Fix formatting issues
pnpm format:fix

# Fix lint issues
pnpm lint:fix
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
   pnpm check
   pnpm test
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

- [ ] Code builds without errors (`pnpm build`)
- [ ] Tests pass (`pnpm test`)
- [ ] Linting passes (`pnpm check`)
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
- `#milaidy` — Milaidy-specific discussion
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
5. **Environment** — OS, Node version, Milaidy version

```markdown
## Bug Report

**Describe the bug:**
Brief description

**To reproduce:**
1. Run `milaidy start`
2. Send message "..."
3. Error occurs

**Expected behavior:**
What should happen

**Environment:**
- OS: macOS 14.2
- Node: 22.12.0
- Milaidy: 2.0.0-alpha.8

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

- [Plugin Development Guide](./plugin-development.md) — Build plugins
- [Skills Documentation](./skills.md) — Create skills
- [Local Plugin Development](./local-plugins.md) — Develop locally
- Browse the codebase: start with `src/runtime/milaidy-plugin.ts`
