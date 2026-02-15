# Local Plugin Development Guide

This guide covers developing plugins locally without publishing to npm — ideal for custom integrations, private plugins, or rapid prototyping.

## Table of Contents

1. [Local Plugin Locations](#local-plugin-locations)
2. [Workspace Discovery](#workspace-discovery)
3. [Configuration-Based Loading](#configuration-based-loading)
4. [Development Workflow](#development-workflow)
5. [Hot Reloading](#hot-reloading)
6. [Debugging](#debugging)
7. [Migrating to npm](#migrating-to-npm)

---

## Local Plugin Locations

Milaidy discovers plugins from multiple locations:

### 1. Workspace Directories

Plugins placed in these directories are auto-discovered:

```
./plugins/           # Project-local plugins
./extensions/        # Alternative naming
./.milaidy/plugins/  # Hidden project plugins
```

### 2. Global Directory

User-wide plugins available to all projects:

```
~/.milaidy/plugins/  # Global plugins
```

### 3. Explicit Paths

Plugins specified directly in configuration (see below).

---

## Workspace Discovery

### Basic Structure

Place your plugin in the `plugins/` directory:

```
my-project/
├── plugins/
│   └── my-plugin/
│       ├── package.json
│       ├── src/
│       │   └── index.ts
│       └── dist/
│           └── index.js
├── milaidy.json
└── package.json
```

### Plugin Requirements

For auto-discovery, your plugin must have:

1. **package.json** with valid structure
2. **Main entry point** (built or source)
3. **Default export** that is a valid Plugin

```json
// plugins/my-plugin/package.json
{
  "name": "my-local-plugin",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc"
  }
}
```

### TypeScript Plugins

For TypeScript plugins, you can either:

**Option A: Pre-build**
```bash
cd plugins/my-plugin
npm run build
```

**Option B: Use tsx (development)**
```json
{
  "main": "src/index.ts"
}
```

Then run Milaidy with tsx support (already built-in for dev mode).

---

## Configuration-Based Loading

### milaidy.json Configuration

Explicitly specify plugin paths in your config:

```json
{
  "plugins": [
    "./plugins/my-plugin",
    "~/shared/team-plugin",
    "/absolute/path/to/plugin"
  ]
}
```

### Path Resolution

- **Relative paths** (`./`, `../`) — Resolved from config file location
- **Tilde paths** (`~/`) — Expanded to home directory
- **Absolute paths** (`/`) — Used as-is

### Plugin Names vs Paths

```json
{
  "plugins": [
    // npm packages (by name)
    "@elizaos/plugin-telegram",

    // Local paths
    "./plugins/custom",

    // Mix both
    "@elizaos/plugin-discord",
    "./plugins/my-discord-extension"
  ]
}
```

### Environment Variable

Override config paths via environment:

```bash
MILAIDY_CONFIG_DIR=/path/to/config milaidy start
```

---

## Development Workflow

### Step 1: Create Plugin Structure

```bash
mkdir -p plugins/my-plugin/src
cd plugins/my-plugin

# Initialize package
cat > package.json << 'EOF'
{
  "name": "my-plugin",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "@elizaos/core": "^2.0.0"
  }
}
EOF

# Install dependencies
pnpm install
```

### Step 2: Write Your Plugin

```typescript
// plugins/my-plugin/src/index.ts
import type { Plugin, Action, Provider } from "@elizaos/core";

const myAction: Action = {
  name: "MY_ACTION",
  description: "Does something cool",
  validate: async () => true,
  handler: async (runtime, message) => {
    return {
      success: true,
      text: "Action executed!",
    };
  },
};

const myProvider: Provider = {
  name: "myContext",
  get: async (runtime, message, state) => {
    return {
      text: "Custom context from my plugin",
    };
  },
};

const plugin: Plugin = {
  name: "my-plugin",
  description: "My local development plugin",
  actions: [myAction],
  providers: [myProvider],
  init: async (config, runtime) => {
    runtime.logger?.info("[my-plugin] Initialized!");
  },
};

export default plugin;
```

### Step 3: Run in Development Mode

```bash
# From project root
pnpm dev

# Or directly
pnpm milaidy start
```

### Step 4: Test Your Plugin

Chat with the agent and trigger your action:

```
You: Do my action
Agent: Action executed!
```

---

## Hot Reloading

### Using Development Mode

In dev mode, source changes trigger rebuilds:

```bash
pnpm dev
```

However, plugins may require an agent restart to reload:

```
You: /restart
Agent: Restarting...
```

### Manual Restart

If changes aren't picked up:

```bash
# Ctrl+C to stop
pnpm dev  # Restart
```

### Watch Mode for Plugin Development

For faster iteration, use a separate watch process:

```bash
# Terminal 1: Watch plugin
cd plugins/my-plugin
pnpm tsc --watch

# Terminal 2: Run agent
cd ../..
pnpm dev
```

---

## Debugging

### Logging

Use the runtime logger for debug output:

```typescript
const plugin: Plugin = {
  name: "my-plugin",
  description: "Debugging example",

  init: async (config, runtime) => {
    runtime.logger?.debug("[my-plugin] Debug info", { config });
    runtime.logger?.info("[my-plugin] Initialized");
    runtime.logger?.warn("[my-plugin] Warning message");
    runtime.logger?.error("[my-plugin] Error occurred", { error: "details" });
  },

  actions: [{
    name: "DEBUG_ACTION",
    description: "Test debugging",
    validate: async () => true,
    handler: async (runtime, message) => {
      runtime.logger?.info("[my-plugin] Action handler called", {
        messageId: message.id,
        content: message.content,
      });

      return { success: true, text: "Check logs!" };
    },
  }],
};
```

### Enable Verbose Logging

```bash
# Environment variable
LOG_LEVEL=debug pnpm dev

# Or in config
{
  "logging": {
    "level": "debug"
  }
}
```

### Breakpoint Debugging

With VS Code:

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Milaidy",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["milaidy", "start"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

### Common Issues

**Plugin not loading:**
```bash
# Check plugin discovery
pnpm milaidy plugins list

# Verify export
node -e "import('./plugins/my-plugin/src/index.ts').then(m => console.log(m.default))"
```

**TypeScript errors:**
```bash
# Check types
cd plugins/my-plugin
pnpm tsc --noEmit
```

**Runtime errors:**
```bash
# Run with full error traces
NODE_OPTIONS="--enable-source-maps" pnpm dev
```

---

## Migrating to npm

When your plugin is ready for distribution:

### Step 1: Update package.json

```json
{
  "name": "@yourorg/plugin-my-feature",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "peerDependencies": {
    "@elizaos/core": "^2.0.0"
  }
}
```

### Step 2: Add tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

### Step 3: Build and Publish

```bash
# Build
npm run build

# Test the build
npm pack
tar -tzf *.tgz

# Publish
npm publish --access public
```

### Step 4: Use in Projects

```json
{
  "plugins": ["@yourorg/plugin-my-feature"]
}
```

---

## Examples

### Example: API Integration Plugin

```
plugins/api-tracker/
├── package.json
├── src/
│   ├── index.ts
│   ├── client.ts
│   └── actions.ts
└── tsconfig.json
```

```typescript
// src/client.ts
export class ApiClient {
  constructor(private apiKey: string) {}

  async fetch(endpoint: string) {
    const res = await fetch(`https://api.example.com/${endpoint}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    return res.json();
  }
}
```

```typescript
// src/actions.ts
import type { Action } from "@elizaos/core";
import { ApiClient } from "./client.js";

export const fetchDataAction: Action = {
  name: "FETCH_DATA",
  description: "Fetch data from the external API",
  validate: async (runtime) => {
    return !!runtime.getSetting("MY_API_KEY");
  },
  handler: async (runtime, message, state, options) => {
    const apiKey = runtime.getSetting("MY_API_KEY");
    const client = new ApiClient(apiKey);

    const endpoint = options?.parameters?.endpoint as string ?? "data";
    const data = await client.fetch(endpoint);

    return {
      success: true,
      text: `Fetched ${data.items?.length ?? 0} items`,
      data,
    };
  },
  parameters: [{
    name: "endpoint",
    description: "API endpoint to fetch",
    required: false,
    schema: { type: "string", default: "data" },
  }],
};
```

```typescript
// src/index.ts
import type { Plugin } from "@elizaos/core";
import { fetchDataAction } from "./actions.js";

const plugin: Plugin = {
  name: "api-tracker",
  description: "Integrates with external API",
  actions: [fetchDataAction],
  config: {
    requiredSettings: ["MY_API_KEY"],
  },
};

export default plugin;
```

---

## Best Practices

1. **Start simple** — Begin with minimal functionality, iterate
2. **Use TypeScript** — Catch errors early with type checking
3. **Log extensively** — Use runtime.logger during development
4. **Test actions manually** — Chat with the agent to verify behavior
5. **Handle errors gracefully** — Return meaningful error messages
6. **Document configuration** — List required settings and env vars
7. **Keep plugins focused** — One plugin per concern
8. **Version your plugins** — Even for local development

---

## Next Steps

- [Plugin Development Guide](./plugin-development.md) — Full plugin reference
- [Skills Documentation](./skills.md) — Lighter-weight extensions
- [Contributing Guide](./contributing.md) — Contributing upstream
