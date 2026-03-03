---
title: CLI Overview
sidebarTitle: Overview
description: The Milady CLI is the primary interface for managing agents, plugins, configuration, and deployment from the terminal.
---

The `milady` CLI is the primary interface for managing the Milady AI agent. Every command is registered through the Commander.js framework and supports `--help` for inline documentation.

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
| `-v, --version` | Print version number |
| `--profile <name>` | Use a named configuration profile (state dir becomes `~/.milady-<name>/`) |
| `--dev` | Shorthand for `--profile dev` (also sets the gateway port to `19001`) |
| `--verbose` | Enable informational runtime logs |
| `--debug` | Enable debug-level runtime logs |
| `--no-color` | Disable ANSI colors |

## Commands

<CardGroup cols={2}>

<Card title="start" icon="play" href="/cli/start">
  Start the ElizaOS agent runtime in headless server-only mode.
</Card>

<Card title="tui" icon="terminal" href="/cli/tui">
  Launch the interactive terminal UI with chat, model selection, and slash commands (default command).
</Card>

<Card title="setup" icon="gear" href="/cli/setup">
  Initialize the config file and bootstrap the agent workspace directory.
</Card>

<Card title="configure" icon="sliders" href="/cli/configure">
  Display configuration guidance and common environment variables.
</Card>

<Card title="config" icon="file-code" href="/cli/config">
  Read and inspect configuration values with get, path, and show subcommands.
</Card>

<Card title="dashboard" icon="gauge" href="/cli/dashboard">
  Open the Control UI in your default web browser.
</Card>

<Card title="models" icon="brain" href="/cli/models">
  Show configured model providers by checking environment variables.
</Card>

<Card title="plugins" icon="plug" href="/cli/plugins">
  Browse, search, install, and manage ElizaOS plugins from the registry.
</Card>

<Card title="update" icon="arrow-up" href="/cli/update">
  Check for and install updates with release channel support (stable, beta, nightly).
</Card>

<Card title="doctor" icon="stethoscope" href="/cli/doctor">
  Diagnose common issues with your installation and configuration (planned).
</Card>

</CardGroup>

## Quick Reference

```bash
# Start the interactive TUI (default command)
milady

# Start agent in headless server mode
milady start

# Launch TUI with a specific model
milady tui -m anthropic/claude-sonnet-4-20250514

# Run setup
milady setup

# Install a plugin
milady plugins install twitter

# Check for updates
milady update

# Show model provider status
milady models
```

## Environment Variables

See [Environment Reference](/cli/environment) for a complete list of environment variables that affect CLI behavior.

## Related

- [Installation](/installation) — Install Milady
- [Quickstart](/quickstart) — Get started in minutes
- [Configuration](/configuration) — Configuration file reference
