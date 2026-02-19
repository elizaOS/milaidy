---
title: "milaidy dashboard"
sidebarTitle: "dashboard"
description: "Open the Milaidy Control UI in your browser."
---

Open the Milaidy Control UI in your default web browser. The command automatically detects whether the agent server is already running and either opens the live instance, connects to an existing dev server, or starts the Vite dev server from the local app source.

## Usage

```bash
milaidy dashboard [options]
```

## Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--port <port>` | number | `2138` | Server port to check for a running instance |
| `--url <url>` | string | (none) | Open a specific URL directly, bypassing port detection |

Global flags:

| Flag | Description |
|------|-------------|
| `--version`, `-v`, `-V` | Print the current Milaidy version and exit |
| `--help`, `-h` | Show help for this command |
| `--profile <name>` | Use a named configuration profile |
| `--dev` | Shorthand for `--profile dev` |

## Examples

```bash
# Open the dashboard (auto-detects running server)
milaidy dashboard

# Check a custom port
milaidy dashboard --port 3000

# Open a specific URL directly
milaidy dashboard --url http://my-server:8080

# Open a remote instance
milaidy dashboard --url https://milady.example.com
```

## Behavior

The `dashboard` command follows this resolution order:

1. **Direct URL** -- if `--url` is provided, opens that URL immediately without any port check.

2. **Check specified port** -- probes `127.0.0.1:<port>` with an 800ms timeout. If listening, opens `http://localhost:<port>`.

3. **Check dev port** -- if the specified port is not responding, checks port `2138` (the default dev server port). If listening, opens `http://localhost:2138`.

4. **Start Vite dev server** -- if neither port is responding, attempts to start the Vite dev server from the `apps/app/` directory inside the Milaidy package root. Once the server reports "Local:" in its output (or after 10 seconds), opens `http://localhost:2138`.

If the app UI is not available in the current installation (e.g. a published npm package without source), the command prints an error and exits with code 1.

## Port Validation

The `--port` flag accepts any value from 1 to 65535. Values outside this range fall back to the default port `2138`.

## Browser Opening

The command opens URLs using the platform-native opener:

| Platform | Command |
|----------|---------|
| macOS | `open <url>` |
| Windows | `cmd /c start "" <url>` |
| Linux | `xdg-open <url>` |

If the browser cannot be opened automatically, the URL is printed to the terminal for manual access.

## Control UI

The Milaidy Control UI is a web application that provides:

- Real-time chat interface connecting to the running agent
- Agent status and session monitoring
- Plugin management
- Configuration inspection

The web UI communicates with the agent API server at `http://localhost:2138` (or the configured port) using REST endpoints and WebSocket connections.

## Related

- [milaidy start](/cli/start) -- start the agent API server that the dashboard connects to
- [milaidy tui](/cli/tui) -- terminal UI alternative to the web dashboard
- [Environment Variables](/cli/environment) -- `MILADY_PORT` and other server configuration
