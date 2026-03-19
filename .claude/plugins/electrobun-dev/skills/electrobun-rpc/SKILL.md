---
name: Electrobun RPC
description: Use when working with Electrobun's RPC system — defineElectrobunRPC, Electroview.defineRPC, ElectrobunRPCSchema types, bun-to-renderer and renderer-to-bun communication. Activates automatically when RPC code is present.
version: 1.0.0
---

# Electrobun RPC System

Type-safe bidirectional communication between the Bun process and webview renderers. Uses WebSockets for transport with AES-GCM encryption. Two call types: `requests` (expects a response) and `messages` (fire-and-forget).

## Schema Definition (shared type)

Define the schema in a shared file both sides import:

```typescript
// src/shared/rpc-schema.ts
import type { ElectrobunRPCSchema, RPCSchema } from "electrobun/view";

// bun: what the BUN process handles (requests from renderer, messages from renderer)
// webview: what the WEBVIEW handles (requests from bun, messages from bun)
export type AppRPC = {
  bun: RPCSchema<{
    requests: {
      getNotes: { args: {}; response: Note[] };
      saveNote: { args: { id: string; title: string; content: string }; response: { success: boolean } };
      deleteNote: { args: { id: string }; response: void };
    };
    messages: {
      userIdleDetected: {};
    };
  }>;
  webview: RPCSchema<{
    requests: {
      getSelectedText: { args: {}; response: string };
    };
    messages: {
      menuAction: { action: string; role?: string };
      noteUpdatedExternally: { id: string };
    };
  }>;
} & ElectrobunRPCSchema;
```

## Bun Side — BrowserView.defineRPC

```typescript
import { BrowserView } from "electrobun/bun";
import type { AppRPC } from "../shared/rpc-schema";

const appRPC = BrowserView.defineRPC<AppRPC>({
  maxRequestTime: 10000, // ms — set higher for file dialogs, heavy DB ops
  handlers: {
    requests: {
      getNotes: async () => {
        return await db.getAllNotes();
      },
      saveNote: async ({ id, title, content }) => {
        await db.saveNote({ id, title, content });
        return { success: true };
      },
      deleteNote: async ({ id }) => {
        await db.deleteNote(id);
      },
    },
    messages: {
      userIdleDetected: () => {
        console.log("User idle, saving state...");
      },
    },
  },
});

// Pass rpc to BrowserView
const view = new BrowserView({ url: "...", rpc: appRPC });

// Send a message to renderer
view.rpc.send.menuAction({ action: "file-new" });

// Make a request to renderer
const selectedText = await view.rpc.request.getSelectedText({});
```

## Renderer Side — Electroview.defineRPC

```typescript
// src/mainview/index.ts
import { Electroview } from "electrobun/view";
import type { AppRPC } from "../shared/rpc-schema";

const rpc = Electroview.defineRPC<AppRPC>({
  maxRequestTime: 10000,
  handlers: {
    requests: {
      getSelectedText: () => {
        return window.getSelection()?.toString() ?? "";
      },
    },
    messages: {
      menuAction: ({ action, role }) => {
        handleMenuAction(action ?? role ?? "unknown");
      },
      noteUpdatedExternally: ({ id }) => {
        reloadNote(id);
      },
    },
  },
});

// Make a request to bun
const notes = await rpc.request.getNotes({});

// Send a message to bun
rpc.send.userIdleDetected({});
```

## Key Rules

- **`requests`**: bidirectional, async, returns a value. Use for: data fetching, file I/O, native dialogs.
- **`messages`**: fire-and-forget, no return value. Use for: notifications, state updates, events.
- **`maxRequestTime`**: always set explicitly. Default may be too low for:
  - File save dialogs: set ≥ 30000
  - Database operations: set ≥ 10000
  - Quick in-memory ops: 5000 is fine
- **Type safety**: the schema type is shared — import it on both sides. Never duplicate the type definition.
- **Encryption**: RPC uses AES-GCM. Keys are auto-generated per session. Don't bypass this.

## Common Gotchas

1. **RPC not available yet**: Wait for `dom-ready` event before calling `view.rpc.request.*`.
2. **maxRequestTime timeout**: Error message is generic. If you see "RPC timeout", increase `maxRequestTime`.
3. **sandbox: true**: Disables RPC entirely. Don't set sandbox on windows that need RPC.
4. **Schema mismatch**: If bun and renderer import different schema types, calls silently fail. Use a single shared type file.
5. **Renderer not initialized**: `Electroview.defineRPC` must be called before any `rpc.request.*` calls.
