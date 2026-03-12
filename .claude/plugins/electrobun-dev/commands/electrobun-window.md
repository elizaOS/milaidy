---
name: electrobun-window
description: Generate a new BrowserWindow with a matching renderer entry point and type-safe RPC schema connecting them. Usage: /electrobun-window [name]
argument-hint: "[window-name]"
---

Generate a new BrowserWindow + BrowserView pair with a working RPC connection.

## Steps

1. **Determine the window name** from the argument or ask the user (e.g. `settings`, `about`, `editor`).

2. **Read the existing codebase** to understand:
   - Where `src/bun/index.ts` is
   - Whether a shared RPC schema file exists (e.g. `src/shared/rpc.ts`)
   - What renderer pattern is used (native vs CEF)

3. **Create `src/<name>/index.html`**:
   ```html
   <!DOCTYPE html>
   <html>
   <head>
     <meta charset="UTF-8" />
     <title><Name> Window</title>
     <link rel="stylesheet" href="index.css" />
   </head>
   <body>
     <div id="app"></div>
     <script type="module" src="index.js"></script>
   </body>
   </html>
   ```

4. **Create `src/<name>/index.css`** with a minimal reset.

5. **Create `src/<name>/index.ts`**:
   ```typescript
   import { Electroview } from "electrobun/view";
   import type { <Name>RPC } from "../shared/<name>-rpc";

   const rpc = Electroview.defineRPC<<Name>RPC>({
     maxRequestTime: 10000,
     handlers: {
       requests: {},  // TODO: add renderer-side request handlers
       messages: {},  // TODO: add renderer-side message handlers
     },
   });

   // TODO: implement renderer UI
   document.getElementById("app")!.textContent = "<Name> Window";
   ```

6. **Create `src/shared/<name>-rpc.ts`**:
   ```typescript
   import type { ElectrobunRPCSchema, RPCSchema } from "electrobun/view";

   export type <Name>RPC = {
     bun: RPCSchema<{
       requests: {
         // TODO: requests the renderer makes to bun
         // example: getData: { args: {}; response: string[] };
       };
       messages: {
         // TODO: messages the renderer sends to bun
       };
     }>;
     webview: RPCSchema<{
       requests: {
         // TODO: requests bun makes to the renderer
       };
       messages: {
         // TODO: messages bun sends to the renderer
         // example: notify: { message: string };
       };
     }>;
   } & ElectrobunRPCSchema;
   ```

7. **Add to `electrobun.config.ts`** — add `<name>: { entrypoint: "src/<name>/index.ts" }` to the `views` section.

8. **Add a BrowserWindow creation block to `src/bun/index.ts`**. Note: the URL scheme (`<name>://`) must match exactly the key used in the `views` section of `electrobun.config.ts`:
   ```typescript
   import { BrowserView } from "electrobun/bun";
   import type { <Name>RPC } from "../shared/<name>-rpc";

   // <Name> Window
   const <name>RPC = BrowserView.defineRPC<<Name>RPC>({
     maxRequestTime: 10000,
     handlers: {
       requests: {
         // TODO: add bun-side request handlers
       },
       messages: {
         // TODO: add bun-side message handlers
       },
     },
   });

   const <name>Win = new BrowserWindow({
     title: "<Name>",
     frame: { width: 800, height: 600 },
     url: "<name>://index.html", // <name> must match the views key in electrobun.config.ts
     rpc: <name>RPC,
   });
   ```

9. **Tell the user** what was created and prompt them to fill in the `TODO` sections in both the schema and the handlers.
