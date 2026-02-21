---
title: "milady doctor"
sidebarTitle: "doctor"
description: "Run diagnostics to verify your Milady installation."
---

Run a suite of diagnostic checks to verify that your Milady installation is healthy and properly configured. The `doctor` command inspects the runtime environment, configuration, API key availability, plugin state, and network connectivity, then prints a structured report with pass/fail indicators and suggested fixes.

> **Note:** The `doctor` command is planned for an upcoming release. The checks described here represent the expected behavior based on the existing CLI architecture.

## Usage

```bash
milady doctor [options]
```

## Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--json` | boolean | false | Output results as machine-readable JSON |
| `--fix` | boolean | false | Attempt to automatically resolve fixable issues |

Global flags:

| Flag | Description |
|------|-------------|
| `--version`, `-v`, `-V` | Print the current Milady version and exit |
| `--help`, `-h` | Show help for this command |
| `--profile <name>` | Run diagnostics against a specific profile |

## Examples

```bash
# Run all diagnostic checks
milady doctor

# Output results as JSON
milady doctor --json

# Check a specific profile
milady --profile staging doctor
```

## Diagnostic Checks

The doctor command is expected to perform the following checks:

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

## Output Format

```
Milady Doctor

Runtime
  ✓ Node.js 22.0.0
  ✓ CLI version 1.2.3 (latest on stable)
  ✓ Config file readable

Configuration
  ✓ Config valid
  ✗ Workspace missing — run: milady setup

API Keys
  ✓ Anthropic (ANTHROPIC_API_KEY configured)
  ✗ No model provider configured — set at least one API key

Plugins
  ✓ No custom plugins to validate
  ✓ Plugin registry cache up to date

Summary: 4 passed, 2 warnings
```

Checks are grouped by category. Each line shows a `✓` (pass), `✗` (fail), or `!` (warning) indicator. Failures include a short suggestion for resolving the issue.

## JSON Output

With `--json`, results are output as a structured object:

```json
{
  "version": "1.2.3",
  "profile": "default",
  "checks": [
    {
      "category": "Runtime",
      "name": "Config file readable",
      "status": "pass",
      "detail": "/Users/you/.milady/milady.json"
    },
    {
      "category": "Configuration",
      "name": "Workspace missing",
      "status": "fail",
      "fix": "milady setup"
    }
  ],
  "summary": { "passed": 4, "failed": 1, "warnings": 1 }
}
```

## Related

- [milady setup](/cli/setup) -- initialize the workspace when setup checks fail
- [milady config](/cli/config) -- inspect configuration values
- [milady models](/cli/models) -- verify model provider key configuration
- [milady plugins test](/cli/plugins) -- validate custom drop-in plugins
- [Environment Variables](/cli/environment) -- all environment variables that affect diagnostics
