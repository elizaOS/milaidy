---
name: electrobun-rpc
description: Introspect existing Electrobun bun-process and renderer files to generate a complete type-safe RPC schema. Reads your code, infers all cross-process calls, and writes the defineElectrobunRPC + Electroview.defineRPC boilerplate.
---

Analyze the current codebase and generate or update the full Electrobun RPC schema.

## Steps

1. **Read all TypeScript files** in `src/bun/` and all renderer directories (any `src/*/index.ts` that imports from `electrobun/view`).

2. **Identify cross-process calls** by scanning for these patterns:

   In bun-side files (outgoing calls to renderer):
   - `rpc?.send.<methodName>(` → message from bun to renderer
   - `rpc?.request.<methodName>(` → request from bun to renderer
   - `rpc.send.<methodName>(` → message from bun to renderer
   - `rpc.request.<methodName>(` → request from bun to renderer

   In renderer-side files (outgoing calls to bun):
   - `rpc.send.<methodName>(` → message from renderer to bun
   - `rpc.request.<methodName>(` → request from renderer to bun
   - `rpc?.send.<methodName>(` / `rpc?.request.<methodName>(`

   In handler definitions (already implemented):
   - `handlers.requests.<methodName>:` → already has a handler
   - `handlers.messages.<methodName>:` → already has a handler

3. **Infer argument and return types** from call sites where possible:
   - If a call site passes `{ id: string, title: string }`, record that as the args type
   - If `await rpc.request.foo({})` is assigned to a typed variable, use that type as response
   - If types cannot be inferred, use `unknown` as a placeholder with a `// TODO: type this` comment

4. **Identify which pair** (bun ↔ renderer) each call belongs to, based on which view/window the rpc is attached to.

5. **Generate or update the schema file** at `src/shared/<view>-rpc.ts` (or `src/shared/rpc.ts` if single-view):

   ```typescript
   import type { ElectrobunRPCSchema, RPCSchema } from "electrobun/view";

   export type <View>RPC = {
     bun: RPCSchema<{
       requests: {
         // ── Renderer → Bun requests ───────────────────────────────────────
         <methodName>: { args: <ArgsType>; response: <ResponseType> };
         // TODO: type this
         <untypedMethod>: { args: unknown; response: unknown };
       };
       messages: {
         // ── Renderer → Bun messages (fire-and-forget) ─────────────────────
         <rendererMessage>: <PayloadType>;
       };
     }>;
     webview: RPCSchema<{
       requests: {
         // ── Bun → Renderer requests ───────────────────────────────────────
         <rendererMethod>: { args: <ArgsType>; response: <ResponseType> };
       };
       messages: {
         // ── Bun → Renderer messages (fire-and-forget) ─────────────────────
         <messageName>: <PayloadType>;
       };
     }>;
   } & ElectrobunRPCSchema;
   ```

6. **Generate updated handler stubs** for any calls that don't yet have handlers:

   In the bun-side file, add stubs to `BrowserView.defineRPC`:
   ```typescript
   // NEW — generated stub, implement me
   <methodName>: async (args) => {
     throw new Error("Not implemented: <methodName>");
   },
   ```

   In the renderer-side file, add stubs to `Electroview.defineRPC`:
   ```typescript
   // NEW — generated stub, implement me
   <methodName>: (args) => {
     throw new Error("Not implemented: <methodName>");
   },
   ```

7. **Show the user** a summary:
   - How many methods were found (requests + messages)
   - How many were already typed vs need `// TODO: type this`
   - How many new stubs were added
   - Where the schema file was written

8. **Ask if they want to proceed** with implementing any of the stub handlers now.
