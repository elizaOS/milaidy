---
title: "milaidy config"
sidebarTitle: "config"
description: "Read and inspect Milaidy configuration values."
---

A group of subcommands for reading and inspecting the Milaidy configuration file. The `config` group provides structured access to values stored in `~/.milady/milady.json` without requiring you to open and parse the file manually.

## Usage

```bash
milaidy config <subcommand> [options]
```

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `get <key>` | Read a single configuration value by dot-notation key |
| `path` | Print the resolved path to the active config file |
| `show` | Display all configuration values grouped by section |

---

## `milaidy config get <key>`

Read a single configuration value. Supports **dot-notation** to traverse nested objects (e.g. `gateway.port`, `agents.defaults.workspace`).

### Usage

```bash
milaidy config get <key>
```

### Behavior

- If the key exists, the value is printed as a string.
- If the value is an object or array, it is pretty-printed as JSON.
- If the key does not exist or is not set, `(not set)` is printed.
- If the config file cannot be loaded, an error is printed and the process exits with code 1.

### Examples

```bash
# Read a simple top-level value
milaidy config get gateway.port

# Read a nested value
milaidy config get agents.defaults.workspace

# Read a full object (printed as JSON)
milaidy config get plugins

# Read a deeply nested value
milaidy config get plugins.load.paths
```

---

## `milaidy config path`

Print the resolved absolute path to the active configuration file. The path is determined by environment variables, profile flags, and built-in defaults.

### Usage

```bash
milaidy config path
```

### Example

```bash
milaidy config path
# Output: /Users/you/.milady/milady.json

# With a profile
milaidy --profile staging config path
# Output: /Users/you/.milady-staging/milady.json
```

The resolved path is affected by:

| Variable | Effect |
|----------|--------|
| `MILADY_CONFIG_PATH` | Use this exact file path |
| `MILADY_STATE_DIR` | Look for `milady.json` in this directory |
| `--profile <name>` | Switches state directory to `~/.milady-<name>/` |

---

## `milaidy config show`

Display all configuration values grouped by logical section, with labels, help text, and sensitive value masking. Sensitive fields (API keys, tokens) are displayed as `--------` in the formatted view.

### Usage

```bash
milaidy config show [options]
```

### Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-a, --all` | boolean | false | Include advanced and hidden fields in the output |
| `--json` | boolean | false | Output raw JSON instead of the formatted grouped table |

### Examples

```bash
# Formatted output grouped by section
milaidy config show

# Include advanced and hidden fields
milaidy config show --all

# Machine-readable JSON (includes actual sensitive values)
milaidy config show --json

# With a profile
milaidy --profile staging config show
```

### Output Format

The formatted output groups values by section (derived from the first segment of the dot-notation key or from explicit `group` hints in the config schema). Each field shows its label, current value, and optional help text. Sensitive fields are masked.

```
Gateway
  Port                     2138
  Auth Token               --------  (API authentication token)

Plugins
  Custom Paths             (not set)
```

The `--json` flag outputs the raw parsed config object -- sensitive values are not masked in JSON mode.

## Config File Location

The configuration file is `~/.milady/milady.json` by default. It is a JSON file that controls all agent behavior, model settings, plugin loading, command permissions, and more.

```bash
# Find the file
milaidy config path

# Open it in your editor
$EDITOR "$(milaidy config path)"
```

## Related

- [milaidy configure](/cli/configure) -- display configuration guidance and provider env vars
- [milaidy setup](/cli/setup) -- initialize the config file on first run
- [Configuration Reference](/configuration) -- full config schema and all available keys
- [Environment Variables](/cli/environment) -- environment variables that affect config resolution
