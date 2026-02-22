# Milady AI Workbench (Claude Code Plugin)

Claude Code plugin tailored for `milady-ai/milady` repositories.

This plugin is designed for agent-only development workflows with strict scope discipline, deterministic quality gates, and Bun-first TypeScript execution.

## Components

- Commands (`./commands`): reusable slash commands for review, test, release, docs, and workflow execution.
- Agents (`./agents`): specialist subagent prompts for PR audit, runtime debugging, security hardening, and plugin mechanics.
- Skills (`./skills`): procedural runbooks for Milady-specific development and quality standards.
- Hooks (`./hooks/hooks.json`): enforcement and context hooks for destructive command blocking and quality nudges.

## Install

Project scope (recommended):

```bash
claude plugin add ./claude-plugins/milady-ai-workbench
```

Session scope:

```bash
claude --plugin-dir ./claude-plugins/milady-ai-workbench
```

## Core capabilities

- Enforces repo scope guardrails (reject aesthetic/UI-only redesign work).
- Uses `bun run pre-review:local` as the primary merge-gate workflow.
- Encourages targeted tests before full suites.
- Supports plugin package maintenance under `packages/plugin-*`.
- Includes compatibility with `@milaidy/plugin-claude-code-workbench` runtime workflows.

## Safety model

- Blocks destructive git commands from Bash tool calls (`git reset --hard`, `git checkout --`, etc.).
- Injects session-start repository policy context.
- Adds post-edit reminders to run relevant checks/tests.

## Recommended companion runtime plugin

This repository also includes runtime plugin package:

- `packages/plugin-claude-code-workbench`

That plugin exposes allowlisted workflows through Eliza runtime actions/routes/providers.
