---
title: "milaidy plugins"
sidebarTitle: "plugins"
description: "Browse, search, install, and manage ElizaOS plugins from the registry."
---

Browse, search, install, and manage ElizaOS plugins from the registry. The `plugins` command group provides 12 subcommands covering the full plugin lifecycle: discovery, installation, configuration, and custom drop-in plugin management.

Plugin names support shorthand resolution: `twitter` resolves to `@elizaos/plugin-twitter`. You can pin to a specific version or dist-tag using `name@version` syntax (e.g. `twitter@1.2.3` or `@custom/plugin-x@next`).

## Usage

```bash
milaidy plugins <subcommand> [options]
```

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `list` | List all plugins from the registry |
| `search <query>` | Search the registry by keyword with relevance scoring |
| `info <name>` | Show detailed information about a plugin |
| `install <name>` | Install a plugin from the registry |
| `uninstall <name>` | Remove a user-installed plugin |
| `installed` | List plugins installed from the registry |
| `refresh` | Force-refresh the registry cache |
| `test` | Validate custom drop-in plugins |
| `config <name>` | Show or edit plugin configuration |
| `add-path <path>` | Register an additional plugin search directory |
| `paths` | List all plugin search directories and their contents |
| `open [name-or-path]` | Open a plugin directory in your editor |

---

## `milaidy plugins list`

List all plugins from the ElizaOS registry, alphabetically sorted.

### Usage

```bash
milaidy plugins list [options]
```

### Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-q, --query <query>` | string | (none) | Filter plugins by name or keyword |
| `-l, --limit <number>` | number | `30` | Max results to show (max: `500`) |

### Examples

```bash
# List all registry plugins
milaidy plugins list

# Search within the list command
milaidy plugins list -q twitter

# Show more results
milaidy plugins list --limit 100
```

When a query is provided, results include version compatibility badges (v0/v1/v2), installation status, tags, and descriptions. Without a query, all registry plugins are listed with a brief description.

---

## `milaidy plugins search <query>`

Search the plugin registry by keyword with relevance scoring and star counts.

### Usage

```bash
milaidy plugins search <query> [options]
```

### Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-l, --limit <number>` | number | `15` | Max results to show (max: `50`) |

### Examples

```bash
milaidy plugins search twitter
milaidy plugins search "discord bot" --limit 30
```

Results show each plugin's name, match percentage, description, and GitHub star count.

---

## `milaidy plugins info <name>`

Show detailed information about a specific plugin from the registry.

### Usage

```bash
milaidy plugins info <name>
```

### Examples

```bash
# Shorthand name
milaidy plugins info twitter

# Fully qualified name
milaidy plugins info @elizaos/plugin-twitter
```

The info view includes: GitHub repository URL, homepage, programming language, star count, topics, npm version availability across ElizaOS versions (v0/v1/v2), and the install command.

---

## `milaidy plugins install <name>`

Install a plugin from the registry. Supports pinning to a specific version or dist-tag.

### Usage

```bash
milaidy plugins install <name> [options]
```

### Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--no-restart` | boolean | false | Install without restarting the agent after installation |

### Examples

```bash
# Install the latest version
milaidy plugins install twitter

# Pin to a specific version
milaidy plugins install twitter@1.2.3

# Install a dist-tag
milaidy plugins install @elizaos/plugin-twitter@next

# Install a custom scoped package
milaidy plugins install @custom/plugin-x@2.0.0

# Install without restarting
milaidy plugins install twitter --no-restart
```

By default, the agent restarts automatically after a successful install to load the new plugin. Use `--no-restart` to defer the restart.

### Name Resolution

Plugin names are normalized using these rules:

| Input | Resolved to |
|-------|-------------|
| `twitter` | `@elizaos/plugin-twitter` |
| `plugin-twitter` | `plugin-twitter` (unchanged) |
| `@elizaos/plugin-twitter` | `@elizaos/plugin-twitter` (unchanged) |
| `twitter@1.2.3` | `@elizaos/plugin-twitter` at version `1.2.3` |

---

## `milaidy plugins uninstall <name>`

Remove a user-installed plugin.

### Usage

```bash
milaidy plugins uninstall <name> [options]
```

### Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--no-restart` | boolean | false | Uninstall without restarting the agent |

### Example

```bash
milaidy plugins uninstall twitter
milaidy plugins uninstall twitter --no-restart
```

---

## `milaidy plugins installed`

List all plugins installed from the registry (does not include bundled or custom drop-in plugins).

### Usage

```bash
milaidy plugins installed
```

Output shows each installed plugin's name and version.

---

## `milaidy plugins refresh`

Force-refresh the plugin registry cache. Fetches the latest plugin data from the remote registry, bypassing any cached results.

### Usage

```bash
milaidy plugins refresh
```

---

## `milaidy plugins test`

Validate custom drop-in plugins placed in `~/.milady/plugins/custom/` and any additional directories registered via `add-path`.

### Usage

```bash
milaidy plugins test
```

For each candidate plugin directory, the test command:

1. Resolves the package entry point from `package.json`
2. Verifies the entry file exists on disk
3. Dynamically imports the module
4. Checks for a valid Plugin export: an object with `name` and `description` strings, plus at least one capability array or `init` function (`services`, `providers`, `actions`, `routes`, `events`, or `init`)

A summary of valid and failed plugins is printed after all candidates are tested.

---

## `milaidy plugins config <name>`

Show or interactively edit the configuration parameters for a plugin.

### Usage

```bash
milaidy plugins config <name> [options]
```

### Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-e, --edit` | boolean | false | Launch interactive edit mode with prompts for each parameter |

### Examples

```bash
# View current plugin configuration
milaidy plugins config twitter

# Interactively edit plugin configuration
milaidy plugins config twitter --edit
```

In **display mode** (default), all plugin parameters are listed with their current values. Sensitive fields (API keys, tokens) are masked as `●●●●●●●●`.

<Note>
This command reads available config parameters from a local `plugins.json` catalog file. If the catalog is not available, parameter discovery may be limited.
</Note>

In **edit mode** (`--edit`), you are prompted for each parameter:
- Text fields use a standard text input
- Sensitive fields use a password input (input is hidden)
- Boolean fields use a confirm prompt

Values are saved to both `process.env` and the `plugins.entries.<pluginId>.config` section of `milady.json`. Restart the agent after editing to apply the changes.

---

## `milaidy plugins add-path <path>`

Register an additional plugin search directory in the config file. The path must be an existing directory.

### Usage

```bash
milaidy plugins add-path <path>
```

### Example

```bash
milaidy plugins add-path ~/my-custom-plugins
milaidy plugins add-path /opt/milady/plugins
```

The path is added to `plugins.load.paths` in `milady.json`. Duplicate paths (after resolution) are detected and rejected. Restart the agent for plugins in the new directory to be loaded.

---

## `milaidy plugins paths`

List all plugin search directories and their contents, including the default custom plugins directory and any directories registered via `add-path`.

### Usage

```bash
milaidy plugins paths
```

Output shows each directory's origin (`custom` for the built-in directory, `config` for registered paths), path, and the plugins found in each.

---

## `milaidy plugins open [name-or-path]`

Open a plugin directory in your editor using the `EDITOR` environment variable (defaults to `code`).

### Usage

```bash
milaidy plugins open [name-or-path]
```

### Examples

```bash
# Open the custom plugins directory
milaidy plugins open

# Open a specific plugin by name
milaidy plugins open twitter

# Open a directory path
milaidy plugins open ~/my-custom-plugins/my-plugin
```

- With no argument: opens `~/.milady/plugins/custom/`
- With a directory path: opens that directory directly
- With a plugin name: looks up the plugin in the custom directory and opens its install path

---

## Custom Drop-In Plugins

Milaidy supports custom plugins that do not need to come from the ElizaOS registry. Place a plugin directory in `~/.milady/plugins/custom/` and it will be automatically loaded at startup.

A valid drop-in plugin directory must:

1. Contain a `package.json` with a `main` or `exports` field pointing to the entry file
2. Export an object with at least `name` (string) and `description` (string) properties
3. Include at least one capability: `services`, `providers`, `actions`, `routes`, `events`, or an `init` function

Use `milaidy plugins test` to validate your custom plugins before restarting the agent.

## Related

- [milaidy plugins test](/cli/plugins) -- validate custom plugins
- [milaidy start](/cli/start) -- restart the agent after installing plugins
- [Configuration Reference](/configuration) -- `plugins` config section
