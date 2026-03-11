---
name: electrobun-menu
description: Generate an ApplicationMenu with File/Edit/View/Help items wired to application-menu-clicked events, plus optional Tray setup. Asks whether to forward events to a webview via RPC.
---

Add an ApplicationMenu (and optionally a Tray) to the current Electrobun project.

## Steps

1. **Ask the user:**
   - Do you want a Tray icon as well? (yes/no)
   - Should menu clicks be forwarded to the webview via RPC? (yes/no)
   - If yes to RPC: which BrowserView variable to target? (e.g. `win.webview`)

2. **Read `src/bun/index.ts`** to understand the existing structure and imports.

3. **Add to `src/bun/index.ts`** (or create `src/bun/menu.ts` if the file is large):

   ```typescript
   import { ApplicationMenu, Electrobun } from "electrobun/bun";
   import { Tray } from "electrobun/bun"; // if Tray requested

   // ── Application Menu ──────────────────────────────────────────────────────
   ApplicationMenu.setMenu([
     {
       label: "File",
       submenu: [
         { label: "New",   action: "file-new",   accelerator: "CmdOrCtrl+N" },
         { label: "Open",  action: "file-open",  accelerator: "CmdOrCtrl+O" },
         { label: "Save",  action: "file-save",  accelerator: "CmdOrCtrl+S" },
         { type: "separator" },
         { label: "Quit",  role: "quit" },
       ],
     },
     {
       label: "Edit",
       submenu: [
         { label: "Undo",      role: "undo",      accelerator: "CmdOrCtrl+Z" },
         { label: "Redo",      role: "redo",      accelerator: "CmdOrCtrl+Shift+Z" },
         { type: "separator" },
         { label: "Cut",       role: "cut",       accelerator: "CmdOrCtrl+X" },
         { label: "Copy",      role: "copy",      accelerator: "CmdOrCtrl+C" },
         { label: "Paste",     role: "paste",     accelerator: "CmdOrCtrl+V" },
         { label: "Select All",role: "selectall", accelerator: "CmdOrCtrl+A" },
       ],
     },
     {
       label: "View",
       submenu: [
         { label: "Reload",          role: "reload",          accelerator: "CmdOrCtrl+R" },
         { label: "Toggle DevTools", role: "toggledevtools",  accelerator: "CmdOrCtrl+Option+I" },
         { type: "separator" },
         { label: "Actual Size",     role: "resetzoom" },
         { label: "Zoom In",         role: "zoomin",          accelerator: "CmdOrCtrl+=" },
         { label: "Zoom Out",        role: "zoomout",         accelerator: "CmdOrCtrl+-" },
       ],
     },
     {
       label: "Help",
       submenu: [
         { label: "About", action: "help-about" },
       ],
     },
   ]);

   // ── Menu Event Handler ────────────────────────────────────────────────────
   Electrobun.events.on("application-menu-clicked", (e) => {
     const { action, role } = e.data;
     console.log("Menu clicked:", action ?? role);

     switch (action) {
       case "file-new":  /* TODO */; break;
       case "file-open": /* TODO */; break;
       case "file-save": /* TODO */; break;
       case "help-about": /* TODO */; break;
     }

     // Forward to renderer via RPC (if requested by user)
     <targetView>.rpc?.send.menuAction({ action: action ?? "", role: role ?? "" });
   });
   ```

   If Tray was requested:
   ```typescript
   // ── Tray ──────────────────────────────────────────────────────────────────
   const tray = new Tray({
     icon: "assets/tray-icon.png",
     tooltip: "<App Name>",
   });

   tray.setMenu([
     { label: "Show",   action: "tray-show" },
     { label: "Hide",   action: "tray-hide" },
     { type: "separator" },
     { label: "Quit",   role: "quit" },
   ]);

   // Note: tray click events do NOT fire on Linux with AppIndicator
   ```

4. **If RPC forwarding was requested**, add `menuAction` to the RPC schema:
   - In the schema file: `menuAction: { action: string; role: string };` under `messages`
   - In the renderer: add a `menuAction` handler that dispatches the action to the UI

5. **Remind the user** about the Linux tray limitation if Tray was added.
