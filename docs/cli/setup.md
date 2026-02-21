---
title: "milady setup"
sidebarTitle: "setup"
description: "Initialize the Milady config file and agent workspace."
---

Initialize the Milady configuration file (`~/.milady/milady.json`) and bootstrap the agent workspace directory with required scaffold files. Run this command once before starting the agent for the first time, or to repair a missing or incomplete workspace.

## Usage

```bash
milady setup [options]
```

## Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--workspace <dir>` | string | (from config or `~/.milady/workspace/`) | Custom agent workspace directory to create or verify |

Global flags:

| Flag | Description |
|------|-------------|
| `--version`, `-v`, `-V` | Print the current Milady version and exit |
| `--help`, `-h` | Show help for this command |
| `--profile <name>` | Use a named configuration profile |
| `--dev` | Shorthand for `--profile dev` |

## Examples

```bash
# Run default setup (uses config or built-in defaults)
milady setup

# Initialize with a custom workspace directory
milady setup --workspace ~/my-agent-workspace

# Setup for a named profile
milady --profile staging setup

# Setup with an absolute path
milady setup --workspace /srv/milady/workspace
```

## Behavior

`milady setup` performs the following steps in order:

1. **Load existing config** -- attempts to read `~/.milady/milady.json`. If the file does not exist (ENOENT), setup continues with default values. Any other error is re-thrown.

2. **Resolve workspace directory** -- the workspace path is resolved using this priority order:
   - `--workspace <dir>` flag (highest priority)
   - `agents.defaults.workspace` value from the loaded config
   - Built-in default (`~/.milady/workspace/`)

3. **Ensure the workspace** -- creates the workspace directory if it does not exist and writes all required bootstrap files (character definition, default settings, etc.). This step is idempotent -- running setup on an existing workspace is safe.

4. **Report success** -- prints the resolved workspace path and a "Setup complete." message.

## Output

```
→ No config found, using defaults
✓ Agent workspace ready: /Users/you/.milady/workspace
Setup complete.
```

If a config file exists:

```
✓ Config loaded
✓ Agent workspace ready: /Users/you/.milady/workspace
Setup complete.
```

## Configuration File Location

The config file path is resolved from environment variables:

| Variable | Effect |
|----------|--------|
| `MILADY_CONFIG_PATH` | Use this exact path for the config file |
| `MILADY_STATE_DIR` | Look for `milady.json` inside this directory |

If neither is set, the default is `~/.milady/milady.json`.

## What the Workspace Contains

The agent workspace is the directory where Milady stores:

- Character definition files
- Memory databases
- Session state
- Plugin data

Bootstrap files are only written on first setup or if they are missing. Existing files are not overwritten.

## Related

- [milady start](/cli/start) -- start the agent runtime after setup
- [milady configure](/cli/configure) -- view configuration guidance
- [milady config](/cli/config) -- read and inspect config values
- [Environment Variables](/cli/environment) -- all environment variables
