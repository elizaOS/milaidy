---
title: "milady update"
sidebarTitle: "update"
description: "Check for and install updates to the Milady CLI."
---

Check for and install updates to the Milady CLI. The `update` command detects your installation method and runs the appropriate update command automatically. It supports release channels (stable, beta, nightly) and an update interval cache to avoid redundant checks.

## Usage

```bash
milady update [options]
milady update status
milady update channel [channel]
```

## Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-c, --channel <channel>` | string | (from config) | Switch release channel before updating (`stable`, `beta`, or `nightly`) |
| `--check` | boolean | false | Check for updates without installing |
| `--force` | boolean | false | Force update check, bypassing the interval cache |

Global flags:

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
# Check for and install updates on the current channel
milady update

# Check for updates without installing
milady update --check

# Switch to the beta channel and update
milady update --channel beta

# Force a fresh check, bypassing the cache
milady update --force

# Switch channel without updating
milady update channel nightly

# View all channel versions
milady update status
```

## Release Channels

| Channel | Description |
|---------|-------------|
| `stable` | Production-ready releases. Recommended for most users. |
| `beta` | Release candidates. May contain minor issues. |
| `nightly` | Latest development builds. May be unstable. |

The active channel is stored in `milady.json` under `update.channel`. It can also be overridden with the `MILADY_UPDATE_CHANNEL` environment variable.

## Behavior

When you run `milady update`:

1. Loads your current config and resolves the active release channel.
2. If `--channel` is provided and differs from the current channel, saves the new channel to `milady.json` and prints the change.
3. Calls the update checker, which fetches the latest version for the active channel from the npm registry.
4. If `--check` is set, prints whether an update is available and exits without installing.
5. Detects the installation method (`npm`, `bunx`, `local-dev`, etc.) and runs the appropriate update command.
6. Prints the result and reminds you to restart Milady for the new version to take effect.

Local development installs (detected by the `local-dev` method) are handled specially -- the command directs you to use `git pull` instead of running a package manager update.

## Subcommands

### `milady update status`

Show the current installed version, active release channel, installation method, and the latest available version across all channels.

```bash
milady update status
```

Example output:

```
Version Status

  Installed:  1.2.3
  Channel:    stable
  Install:    npm

Available Versions

  Fetching from npm registry...

  stable                   1.2.3  <-- current
  beta                     1.3.0-beta.1
  nightly                  1.3.0-nightly.20260219
```

### `milady update channel [channel]`

View the current release channel and all available options, or switch to a different channel.

```bash
# View current channel and all options
milady update channel

# Switch to a specific channel
milady update channel beta
milady update channel stable
milady update channel nightly
```

Switching channels with this command saves the new channel to `milady.json`. Run `milady update` afterward to install the latest version from the new channel.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MILADY_UPDATE_CHANNEL` | Override the active release channel (`stable`, `beta`, or `nightly`). Takes precedence over the config file value. |

## Update Cache

The update checker caches the last check time in `milady.json` (`update.lastCheckAt`) to avoid checking too frequently. Use `--force` to bypass this cache and force a fresh network request.

When switching channels (`--channel` or `update channel`), the cache is automatically cleared for the new channel.

## Related

- [milady start](/cli/start) -- restart the agent after updating
- [Environment Variables](/cli/environment) -- `MILADY_UPDATE_CHANNEL` and other variables
- [Self-Updates](/self-updates) -- detailed documentation on the update system
