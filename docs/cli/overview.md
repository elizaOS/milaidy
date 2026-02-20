---
title: CLI Overview
sidebarTitle: Overview
description: The Milaidy CLI is the primary interface for managing agents, plugins, configuration, and deployment from the terminal.
---

The `milaidy` CLI is the primary interface for managing the Milaidy AI agent. Every command is registered through the Commander.js framework and supports `--help` for inline documentation.

## Installation

```bash
bun install -g milaidy
```

Or run directly:

```bash
bunx milaidy
```

## Global Flags

| Flag | Description |
|------|-------------|
| `--help`, `-h` | Show help for any command |
| `--version`, `-V` | Print version number |
| `--profile <name>` | Use a named configuration profile |
| `--verbose` | Enable verbose logging |
| `--quiet` | Suppress non-essential output |
| `--json` | Output in JSON format |

## Commands

<CardGroup cols={2}>

<Card title="start" icon="play" href="/cli/start">
  Start the agent runtime with optional character file and configuration overrides.
</Card>

<Card title="tui" icon="terminal" href="/cli/tui">
  Launch the terminal user interface for interactive agent management.
</Card>

<Card title="setup" icon="gear" href="/cli/setup">
  Run the interactive setup wizard to configure API keys and preferences.
</Card>

<Card title="configure" icon="sliders" href="/cli/configure">
  Modify runtime configuration interactively or via flags.
</Card>

<Card title="config" icon="file-code" href="/cli/config">
  Read and write configuration values directly.
</Card>

<Card title="dashboard" icon="gauge" href="/cli/dashboard">
  Launch the web dashboard for browser-based management.
</Card>

<Card title="models" icon="brain" href="/cli/models">
  List, test, and manage model providers and configurations.
</Card>

<Card title="plugins" icon="plug" href="/cli/plugins">
  Install, remove, enable, disable, and eject plugins.
</Card>

<Card title="update" icon="arrow-up" href="/cli/update">
  Check for and apply updates to the Milaidy installation.
</Card>

<Card title="doctor" icon="stethoscope" href="/cli/doctor">
  Diagnose common issues with your installation and configuration.
</Card>

</CardGroup>

## Quick Reference

```bash
# Start agent with default character
milaidy start

# Start with a specific character
milaidy start --character ./my-character.json

# Launch TUI
milaidy tui

# Run setup wizard
milaidy setup

# Install a plugin
milaidy plugins install @elizaos/plugin-openai

# Check for updates
milaidy update

# Diagnose issues
milaidy doctor
```

## Environment Variables

See [Environment Reference](/cli/environment) for a complete list of environment variables that affect CLI behavior.

## Related

- [Installation](/installation) — Install Milaidy
- [Quickstart](/quickstart) — Get started in minutes
- [Configuration](/configuration) — Configuration file reference
