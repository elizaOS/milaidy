---
title: "milady start"
sidebarTitle: "start"
description: "Start the Milady agent runtime in server-only mode."
---

Start the ElizaOS agent runtime without an interactive terminal UI. The runtime boots in `serverOnly` mode, which means the API server and agent loop start but no TUI or interactive chat interface is launched. The `run` command is a direct alias for `start`.

## Usage

```bash
milady start
milady run     # alias for start
```

## Options

`milady start` has no command-specific flags. All behavior is controlled through the configuration file (`~/.milady/milady.json`) and environment variables.

Global flags that apply to this command:

| Flag | Description |
|------|-------------|
| `-v, --version` | Print the current Milady version and exit |
| `--help`, `-h` | Show help for this command |
| `--profile <name>` | Use a named configuration profile (state dir becomes `~/.milady-<name>/`) |
| `--dev` | Shorthand for `--profile dev` (also sets the gateway port to `19001`) |
| `--verbose` | Enable informational runtime logs |
| `--debug` | Enable debug-level runtime logs |
| `--no-color` | Disable ANSI colors |

## Examples

```bash
# Start the agent runtime in server mode
milady start

# Start using the run alias
milady run

# Start with a named profile (isolated state directory)
milady --profile production start

# Start with the dev profile
milady --dev start
```

## Behavior

When you run `milady start`:

1. The CLI calls `startEliza({ serverOnly: true })` from the ElizaOS runtime.
2. The API server starts on port `2138` by default (override with `MILADY_PORT`).
3. The agent loop begins processing messages from connected clients and messaging platforms.
4. No interactive terminal UI is launched -- the process runs headlessly.

The `run` command is a direct alias that calls the exact same `startEliza({ serverOnly: true })` function.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MILADY_PORT` | API server port | `2138` |
| `MILADY_STATE_DIR` | State directory override | `~/.milady/` |
| `MILADY_CONFIG_PATH` | Config file path override | `~/.milady/milady.json` |

## Deployment

`milady start` is the recommended entry point for:

- Production deployments
- Docker containers
- CI/CD environments
- Any headless or server environment

Use your preferred process manager to keep the agent running:

```bash
# With pm2
pm2 start "milady start" --name milady

# With systemd (create a service unit)
ExecStart=/usr/local/bin/milady start

# In a Dockerfile
CMD ["milady", "start"]
```

The API server supports hot-restart via `POST /api/agent/restart` when `commands.restart` is enabled in the config.

## Related

- [milady tui](/cli/tui) -- start with the interactive terminal UI
- [milady setup](/cli/setup) -- initialize the config and workspace before starting
- [Environment Variables](/cli/environment) -- all environment variables
- [Configuration](/configuration) -- full config file reference
