---
title: "Providers"
sidebarTitle: "Providers"
description: "Provider interface, registration, context injection mechanism, and the built-in Milady providers."
---

Providers are functions that inject additional text into the agent's context on every conversation turn. They allow plugins and external systems to enrich the prompt with dynamic information without modifying the system prompt template.

## Provider Interface

From `@elizaos/core`:

```typescript
export interface Provider {
  name: string;
  description?: string;
  get(
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
  ): Promise<ProviderResult>;
}

export interface ProviderResult {
  text?: string;
  data?: Record<string, unknown>;
}
```

| Field | Type | Description |
|---|---|---|
| `name` | string | Unique provider identifier (e.g., `"workspace"`, `"emotes"`) |
| `description` | string | Optional description shown in debug output |
| `get()` | function | Called on every turn to produce context text |

The `text` returned by `get()` is appended to the assembled context string. An empty string or `undefined` injects nothing.

## Context Injection Mechanism

At each conversation turn, ElizaOS assembles the state by calling every registered provider:

```
Character.system (base system prompt)
  + character.bio lines
  + character.style.all rules
  + provider[0].text
  + provider[1].text
  + ...
  + recent message history
  = final context sent to LLM
```

Provider results are concatenated in registration order.

## Built-in Milady Providers

The Milady plugin (`createMiladyPlugin()`) registers the following providers:

### Channel Profile Provider

**Name:** `channelProfile` (from `createChannelProfileProvider()`)

Injects channel-specific behavior rules. Adapts the agent's tone for DMs vs. group conversations vs. channels.

**Source:** `src/providers/simple-mode.ts`

### Workspace Provider

**Name:** `workspace` (from `createWorkspaceProvider()`)

Reads the agent's workspace directory and injects a summary of relevant files into context.

```typescript
createWorkspaceProvider({
  workspaceDir: "~/.milady/workspace",
  maxCharsPerFile: config.agents?.defaults?.bootstrapMaxChars,
})
```

`maxCharsPerFile` (alias `bootstrapMaxChars`) limits how many characters from each file are injected, preventing oversized contexts. Default is 20,000 characters.

**Source:** `src/providers/workspace-provider.ts`

### Admin Trust Provider

**Name:** `adminTrust`

Injects a trust context block indicating whether the current conversation participant has admin privileges.

```
## Trust Level
This conversation is with a trusted admin. Elevated permissions are active.
```

**Source:** `src/providers/admin-trust.ts`

### Autonomous State Provider

**Name:** from `createAutonomousStateProvider()`

Injects the current autonomous mode status so the agent knows whether it is in interactive or autonomous operation:

```
## Autonomous Mode
Status: active
```

**Source:** `src/providers/autonomous-state.ts`

### Session Key Provider

**Name:** from `createSessionKeyProvider()`

Injects the cryptographic session key for the current session, enabling authenticated inter-session communication.

```typescript
createSessionKeyProvider({ defaultAgentId: "main" })
```

**Source:** `src/providers/session-bridge.ts`

### Session Providers

From `getSessionProviders()` — a set of providers for session-level context (current session metadata, active participants, etc.).

**Source:** `src/providers/session-utils.ts`

### UI Catalog Provider

**Name:** `uiCatalog`

Injects the Milady UI component catalog, allowing the agent to compose structured UI elements in its responses.

**Source:** `src/providers/ui-catalog.ts` (`uiCatalogProvider`)

### Emote Provider

**Name:** `emotes`

Injects available avatar animation IDs when the agent has a 3D avatar. This tells the LLM it can trigger animations via the `PLAY_EMOTE` action.

```
## Available Emotes

You can play emote animations on your 3D avatar using the PLAY_EMOTE action.
Use emotes sparingly and naturally during conversation to express yourself.

Available emote IDs: wave, dance, sit, think, clap, ...
```

Disabled by setting `character.settings.DISABLE_EMOTES = true`. Saves approximately 300 tokens per turn.

### Custom Actions Provider

**Name:** `customActions`

When user-defined custom actions are configured in `milady.json`, this provider injects the list:

```
## Custom Actions

The following custom actions are available:
- **FETCH_PRICE**: Fetch current token price [params: token (required)]
- **SEND_ALERT**: Send an alert [params: message (required), channel]
```

Returns empty text when no custom actions exist (no token cost).

## Provider Registration

Providers are registered as part of the Plugin object:

```typescript
return {
  name: "my-plugin",
  providers: [
    {
      name: "my-context",
      description: "Injects weather data",
      async get(runtime, message, state) {
        const weather = await fetchWeather();
        return {
          text: `## Current Weather\n\n${weather.description}`,
          data: { weather },
        };
      },
    },
  ],
};
```

## Creating a Custom Provider

To add a provider outside a plugin, include it in the `providers` array of any Plugin you control:

```typescript
import type { IAgentRuntime, Memory, Provider, ProviderResult, State } from "@elizaos/core";

const myProvider: Provider = {
  name: "myContext",
  description: "Provides custom context for the agent",

  async get(
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
  ): Promise<ProviderResult> {
    // Compute your context
    const data = await fetchSomeData();

    if (!data) {
      return { text: "" }; // Return empty to inject nothing
    }

    return {
      text: [
        "## My Context",
        "",
        `Current value: ${data.value}`,
      ].join("\n"),
      data: { myData: data }, // Optional structured data
    };
  },
};
```

## Provider Ordering

Providers registered in the Milady plugin follow this order:

```
1. channelProfile     (channel context)
2. workspace          (file system context)
3. adminTrust         (trust level)
4. autonomousState    (autonomy status)
5. sessionKey         (session auth)
6. ...sessionProviders
7. uiCatalog          (UI components)
8. emotes             (avatar animations)
9. customActions      (user-defined actions)
```

Order matters: context assembled later in the list appears closer to the end of the injected system context and may be more salient to some models.

## Error Handling

Provider errors are caught by the error boundary wrapper in `wrapPluginWithErrorBoundary()`. A crashing provider returns:

```
[Provider myContext error: Cannot read properties of undefined]
```

This marker is visible in context so the LLM can note the failure rather than silently operating with incomplete context.

## Related Pages

- [Personality and Behavior](/agents/personality-and-behavior) — how providers combine with Character fields
- [Core Runtime](/runtime/core) — plugin registration and error boundaries
- [Types](/runtime/types) — Provider and ProviderResult type definitions
