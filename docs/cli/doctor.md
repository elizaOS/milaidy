---
title: "milady doctor"
sidebarTitle: "doctor"
description: "Run diagnostics to verify your Milady installation (planned)."
---

<Warning>
The `doctor` command is **not yet implemented**. This page describes the planned behavior for an upcoming release. Running `milady doctor` will currently produce an "unknown command" error.
</Warning>

The `doctor` command will run a suite of diagnostic checks to verify that your Milady installation is healthy and properly configured. It will inspect the runtime environment, configuration, API key availability, plugin state, and network connectivity, then print a structured report with pass/fail indicators and suggested fixes.

## Planned Usage

```bash
milady doctor
```

## Planned Diagnostic Checks

### Runtime

| Check | Pass Condition |
|-------|---------------|
| Node.js / Bun version | Runtime meets minimum version requirement |
| CLI version | Installed version matches the latest on the active channel |
| Config file readable | `~/.milady/milady.json` exists and is valid JSON |
| State directory writable | `~/.milady/` can be written to |

### Configuration

| Check | Pass Condition |
|-------|---------------|
| Config file valid | File parses without errors and matches the expected schema |
| Workspace directory | Workspace directory exists and contains bootstrap files |
| Config path resolution | `MILADY_STATE_DIR` and `MILADY_CONFIG_PATH` resolve to accessible paths |

### API Keys

| Check | Pass Condition |
|-------|---------------|
| At least one model provider configured | One or more model provider environment variables is set |
| Anthropic API key | `ANTHROPIC_API_KEY` is set (checked if present) |
| OpenAI API key | `OPENAI_API_KEY` is set (checked if present) |
| Other provider keys | Any other provider keys detected |

### Connectivity

| Check | Pass Condition |
|-------|---------------|
| API server reachable | Port `2138` (or `MILADY_PORT`) responds to a TCP probe |
| npm registry reachable | The plugin registry endpoint is accessible |

### Plugins

| Check | Pass Condition |
|-------|---------------|
| Custom plugins valid | All plugins in `~/.milady/plugins/custom/` pass the plugin validation test |
| Plugin registry cache | Registry cache file is present and not stale |
| Installed plugins | All registry-installed plugins are present on disk |

## Workarounds Until `doctor` Exists

You can manually verify your installation using existing commands:

```bash
# Check model providers
milady models

# Validate custom plugins
milady plugins test

# Inspect config file location and values
milady config path
milady config show

# Verify workspace setup
milady setup
```

## Related

- [milady setup](/cli/setup) -- initialize the workspace
- [milady config](/cli/config) -- inspect configuration values
- [milady models](/cli/models) -- verify model provider key configuration
- [milady plugins test](/cli/plugins) -- validate custom drop-in plugins
- [Environment Variables](/cli/environment) -- all environment variables that affect diagnostics
