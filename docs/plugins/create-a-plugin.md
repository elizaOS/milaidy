---
title: "Create a Plugin"
sidebarTitle: "Create a Plugin"
description: "Step-by-step tutorial for building a Milady plugin from scratch — scaffolding, actions, providers, testing, and local development."
---

This tutorial walks you through creating a complete plugin from scratch. By the end you will have a working plugin with an action, a provider, and a background service running inside the Milady runtime.

## Prerequisites

- Node.js 22 or later
- A working Milady installation (`milady start` runs without errors)

## Step 1: Scaffold the Project

Create the directory structure:

```
my-plugin/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts
```

### package.json

```json
{
  "name": "@elizaos/plugin-my-feature",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run"
  },
  "dependencies": {
    "@elizaos/core": "next"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vitest": "^4.0.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "declaration": true,
    "strict": true
  },
  "include": ["src"]
}
```

## Step 2: Implement an Action

Actions are things the agent can do. The LLM selects actions from the registered list based on description and examples.

```typescript
// src/actions/weather.ts
import type { Action } from "@elizaos/core";

export const checkWeatherAction: Action = {
  name: "CHECK_WEATHER",
  description: "Check the current weather for a city",
  similes: ["GET_WEATHER", "WEATHER_LOOKUP", "FORECAST"],

  validate: async (_runtime, _message, _state) => {
    // Return false if the required API key is missing
    return Boolean(process.env.WEATHER_API_KEY);
  },

  handler: async (_runtime, _message, _state, options, _callback) => {
    const params = options?.parameters as Record<string, unknown> | undefined;
    const city = typeof params?.city === "string" ? params.city : "London";

    try {
      const url = `https://api.example-weather.com/current?city=${encodeURIComponent(city)}&key=${process.env.WEATHER_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json() as { temp: number; condition: string };

      return {
        success: true,
        text: `Weather in ${city}: ${data.temp}°C, ${data.condition}`,
        data: { city, temp: data.temp, condition: data.condition },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to fetch weather: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },

  parameters: [
    {
      name: "city",
      description: "The city to check weather for",
      required: false,
      schema: { type: "string" },
    },
  ],

  examples: [
    [
      { user: "user", content: { text: "What's the weather in Tokyo?" } },
      { user: "assistant", content: { text: "Weather in Tokyo: 22°C, Partly cloudy", action: "CHECK_WEATHER" } },
    ],
  ],
};
```

## Step 3: Implement a Provider

Providers inject context into the agent's prompt before each LLM inference. Unlike actions, they run automatically.

```typescript
// src/providers/status.ts
import type { Provider } from "@elizaos/core";

export const pluginStatusProvider: Provider = {
  name: "weatherPluginStatus",
  description: "Provides current plugin status and configuration",
  position: 10, // Run after core providers

  get: async (_runtime, _message, _state) => {
    const hasApiKey = Boolean(process.env.WEATHER_API_KEY);

    return {
      text: hasApiKey
        ? "Weather plugin is active. You can check weather for any city."
        : "Weather plugin is configured but missing WEATHER_API_KEY.",
      values: {
        weatherPluginActive: hasApiKey,
      },
    };
  },
};
```

## Step 4: Implement a Service

Services are long-running background processes that start with the runtime.

```typescript
// src/services/weather-cache.ts
import type { IAgentRuntime, Service } from "@elizaos/core";

let cacheInterval: NodeJS.Timeout | undefined;
const weatherCache = new Map<string, { temp: number; condition: string; fetchedAt: number }>();

export const WeatherCacheService = {
  serviceType: "weather_cache",

  start: async (_runtime: IAgentRuntime): Promise<Service> => {
    // Refresh cache every 10 minutes
    cacheInterval = setInterval(() => {
      const now = Date.now();
      for (const [city, entry] of weatherCache) {
        if (now - entry.fetchedAt > 10 * 60 * 1000) {
          weatherCache.delete(city);
        }
      }
    }, 60_000);

    return {
      stop: async () => {
        if (cacheInterval) clearInterval(cacheInterval);
        weatherCache.clear();
      },
    } as Service;
  },
};
```

## Step 5: Assemble the Plugin

```typescript
// src/index.ts
import type { Plugin } from "@elizaos/core";
import { checkWeatherAction } from "./actions/weather";
import { pluginStatusProvider } from "./providers/status";
import { WeatherCacheService } from "./services/weather-cache";

const weatherPlugin: Plugin = {
  name: "weather-plugin",
  description: "Provides real-time weather information for any city",
  priority: 10,

  init: async (_config, runtime) => {
    runtime.logger?.info("[weather-plugin] Initialized");
    if (!process.env.WEATHER_API_KEY) {
      runtime.logger?.warn("[weather-plugin] WEATHER_API_KEY not set — CHECK_WEATHER action will be disabled");
    }
  },

  actions: [checkWeatherAction],
  providers: [pluginStatusProvider],
  services: [WeatherCacheService as any],
};

export default weatherPlugin;
```

## Step 6: Write Tests

```typescript
// src/index.test.ts
import { describe, it, expect, vi } from "vitest";
import weatherPlugin from "./index";

const mockRuntime = {
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
} as any;

const mockMessage = { content: { text: "What is the weather in Paris?" } } as any;

describe("weather-plugin", () => {
  it("exports a valid plugin", () => {
    expect(weatherPlugin.name).toBe("weather-plugin");
    expect(weatherPlugin.actions).toHaveLength(1);
    expect(weatherPlugin.providers).toHaveLength(1);
  });

  it("CHECK_WEATHER action fails validation without API key", async () => {
    delete process.env.WEATHER_API_KEY;
    const action = weatherPlugin.actions![0];
    const valid = await action.validate(mockRuntime, mockMessage, undefined as any);
    expect(valid).toBe(false);
  });

  it("CHECK_WEATHER action passes validation with API key", async () => {
    process.env.WEATHER_API_KEY = "test-key";
    const action = weatherPlugin.actions![0];
    const valid = await action.validate(mockRuntime, mockMessage, undefined as any);
    expect(valid).toBe(true);
    delete process.env.WEATHER_API_KEY;
  });
});
```

## Step 7: Register with Runtime

### Option A: Local Plugin (Development)

Place the plugin directory inside the project:

```
milady-project/
└── plugins/
    └── weather-plugin/
        ├── package.json
        └── src/index.ts
```

Milady automatically discovers plugins in the `plugins/` directory.

### Option B: Config-Based Loading

Add to `milady.json`:

```json
{
  "plugins": {
    "allow": ["weather-plugin"],
    "entries": {
      "weather-plugin": {
        "path": "./plugins/weather-plugin"
      }
    }
  }
}
```

### Option C: Character File

```json
{
  "name": "MyAgent",
  "plugins": ["./plugins/weather-plugin"],
  "settings": {
    "secrets": {
      "WEATHER_API_KEY": "your-key-here"
    }
  }
}
```

## Step 8: Build and Test

```bash
# Build the plugin
cd my-plugin && npm run build

# Run tests
npm test

# Start Milady with the plugin loaded
milady start
```

Check the logs for `[weather-plugin] Initialized` to confirm the plugin loaded.

## Next Steps

- [Plugin Patterns](/plugins/patterns) — Common patterns for services, state, and error handling
- [Plugin Schemas](/plugins/schemas) — Full schema reference for all plugin types
- [Publish a Plugin](/plugins/publish) — Publish to the npm registry
