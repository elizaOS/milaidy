---
name: Electrobun Testing
description: Use when writing Electrobun tests, adding test coverage to the Kitchen Sink, implementing the defineTest() pattern, generating new test suites, understanding what the kitchen sink tests, or reverse-engineering component behaviour from test source. Activates on test authoring, test framework, or test-driven development questions.
version: 1.0.0
---

# Electrobun Testing

Tests for Electrobun APIs live in the Kitchen Sink app (`kitchen/src/tests/`).

## Test Definition Pattern

All tests use `defineTest()` from the test framework:

```typescript
// kitchen/src/tests/window.test.ts
import { defineTest } from "../test-framework/defineTest";

export const windowTests = [
  defineTest({
    id: "window-creation-with-url",          // stable slug — must be unique
    title: "Window creation with URL",
    category: "BrowserWindow",
    description: "Verifies BrowserWindow can be created with a URL",
    interactive: false,                       // automated: no human needed
    apiSurface: ["BrowserWindow"],            // APIs exercised (for manifest)
    async run({ assert, log }) {
      const win = new BrowserWindow({
        title: "Test Window",
        url: "views://test-harness/index.html",
        hidden: true,
        rpc: testRpc,
      });
      log("Window created, id:", win.id);
      assert(win.id > 0, "Window should have valid id");
      await win.close();
    },
  }),
];
```

### defineTest() Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Stable slug (kebab-case, globally unique) |
| `title` | string | ✅ | Human-readable display name |
| `category` | string | ✅ | API grouping (e.g. "BrowserWindow", "Utils") |
| `description` | string | ✅ | One-sentence description |
| `interactive` | boolean | ✅ | `true` if requires human input |
| `apiSurface` | string[] | ✅ | Electrobun APIs exercised |
| `run` | async function | ✅ | Test body (see below) |
| `playgroundRoute` | string? | — | Playground HTML path if has UI |
| `uiSelectors` | string[] | — | CSS selectors used in playground |
| `platformCaveats` | string[] | — | e.g. `["macOS only"]` |

### Test Body API

```typescript
async run({ assert, log, skip, fail }) {
  // assert(condition, message) — fails test if false
  assert(value === expected, "description of what was expected");

  // log(message) — appears in test runner UI
  log("Window id:", win.id);

  // skip(reason) — marks test as skipped (not failed)
  if (process.platform === "win32") skip("Not supported on Windows");

  // fail(message) — immediately fail with message
  fail("Should not reach here");
}
```

## Registering Test Suites

After writing a test file, add it to the aggregator:

```typescript
// kitchen/src/tests/index.ts
import { windowTests } from "./window.test";
import { myNewTests } from "./my-new-feature.test";

export const allTests = [
  ...windowTests,
  ...myNewTests,   // ← add here
];
```

Then regenerate the manifest:

```bash
cd kitchen
npx tsx scripts/generate-manifest.ts
```

## Writing Automated Tests

Automated tests (`interactive: false`) run entirely in code — no human in the loop.

### Pattern: Test a BrowserWindow method

```typescript
defineTest({
  id: "window-set-title",
  title: "BrowserWindow.setTitle()",
  category: "BrowserWindow",
  description: "Verifies setTitle changes the window title",
  interactive: false,
  apiSurface: ["BrowserWindow"],
  async run({ assert, log }) {
    const win = new BrowserWindow({
      title: "Original Title",
      url: "views://test-harness/index.html",
      hidden: true,
      rpc: testRpc,
    });
    win.setTitle("New Title");
    // Observe via evaluateJavascript or just test the API doesn't throw
    log("Title changed successfully");
    assert(true, "setTitle completed without error");
    await win.close();
  },
}),
```

### Pattern: Test RPC round-trip

```typescript
defineTest({
  id: "rpc-request-response",
  title: "RPC request-response round trip",
  category: "RPC",
  description: "Verifies bun-side request handler is callable from webview",
  interactive: false,
  apiSurface: ["BrowserView"],
  async run({ assert, log }) {
    const win = new BrowserWindow({
      title: "RPC Test",
      url: "views://test-harness/index.html",
      hidden: true,
      rpc: testRpc,
    });
    // Use evaluateJavascriptWithResponse to trigger webview-side RPC call
    const result = await win.webview.rpc.request.evaluateJavascriptWithResponse({
      script: `electrobun.rpc.request.someBunFunction({ a: 2, b: 3 })`,
    });
    assert(result === 5, `Expected 5, got ${result}`);
    log("RPC round trip passed");
    await win.close();
  },
}),
```

### Pattern: Test Utils / system APIs

```typescript
defineTest({
  id: "utils-clipboard-text",
  title: "Clipboard read/write text",
  category: "Utils",
  description: "Verifies clipboardWriteText and clipboardReadText round-trip",
  interactive: false,
  apiSurface: ["Utils"],
  async run({ assert, log }) {
    Utils.clipboardWriteText("electrobun-test-value");
    const text = Utils.clipboardReadText();
    assert(text === "electrobun-test-value", `Expected clipboard text, got: ${text}`);
    Utils.clipboardClear();
    log("Clipboard round-trip passed");
  },
}),
```

### Pattern: Test navigation rules

```typescript
defineTest({
  id: "navigation-block-rule",
  title: "setNavigationRules blocks disallowed URL",
  category: "Navigation",
  description: "Verifies last-match-wins navigation rules",
  interactive: false,
  apiSurface: ["BrowserView"],
  async run({ assert, log }) {
    const win = new BrowserWindow({ url: "views://test-harness/index.html", hidden: true, rpc: testRpc });
    win.webview.setNavigationRules([
      { match: "*", allow: false },           // block all
      { match: "views://*", allow: true },    // allow views:// (last match wins)
    ]);
    // Navigate to allowed URL — should succeed
    await win.webview.loadURL("views://test-harness/index.html");
    log("Navigation rules applied");
    await win.close();
  },
}),
```

## Writing Interactive Tests

Interactive tests (`interactive: true`) open a playground window and walk the user through a verification flow.

```typescript
defineTest({
  id: "dialog-open-file",
  title: "Open file dialog",
  category: "Dialogs",
  description: "Opens the native file picker and verifies a path is returned",
  interactive: true,
  apiSurface: ["Utils"],
  playgroundRoute: "playgrounds/file-dialog/index.html",
  uiSelectors: ["#openDialogBtn", "#result"],
  async run({ assert, log, waitForReady, waitForVerify }) {
    // Open the playground window
    const playground = new BrowserWindow({
      title: "File Dialog Playground",
      url: "views://playgrounds/file-dialog/index.html",
      rpc: playgroundRpc,
    });

    // Wait for user to click Start in the modal
    await waitForReady();

    // Instructions have been shown; user now interacts with playground window
    // Wait for user to click Pass/Fail/Retest
    const { action, notes } = await waitForVerify();

    assert(action === "pass", `User marked ${action}: ${notes}`);
    await playground.close();
  },
}),
```

## Full API Surface Tested by Kitchen Sink

### BrowserWindow
`new BrowserWindow(options)`, `getById(id)`, `webview`, `setTitle`, `close`, `focus`, `show`, `minimize`, `unminimize`, `isMinimized`, `maximize`, `unmaximize`, `isMaximized`, `setFullScreen`, `isFullScreen`, `setAlwaysOnTop`, `isAlwaysOnTop`, `setVisibleOnAllWorkspaces`, `isVisibleOnAllWorkspaces`, `setPosition`, `setSize`, `setFrame`, `getFrame`, `getPosition`, `getSize`, `setPageZoom`, `getPageZoom`, `on('close'|'move'|'resize'|'blur'|'focus')`

### BrowserView
`BrowserView.defineRPC(schema)`, `new BrowserView(options)`, `executeJavascript`, `loadURL`, `loadHTML`, `setNavigationRules`, `stopFindInPage`, `openDevTools`, `closeDevTools`, `toggleDevTools`, `setPageZoom`, `getPageZoom`, `remove`, `getById`, `getAll`, `on('will-navigate'|'did-navigate'|'dom-ready')`, `rpc.request.evaluateJavascriptWithResponse`

### Tray
`new Tray(options)`, `setTitle`, `setImage`, `setMenu`, `setVisible`, `getBounds`, `remove`, `on('tray-clicked')`, `getById`, `getAll`, `removeById`

### ApplicationMenu / ContextMenu
`ApplicationMenu.setApplicationMenu(menu)`, `ContextMenu.showContextMenu(menu)`, `Electrobun.events.on('application-menu-clicked')`, `Electrobun.events.on('context-menu-clicked')`

### Utils
`moveToTrash`, `showItemInFolder`, `openExternal`, `openPath`, `setDockIconVisible`, `isDockIconVisible`, `showNotification`, `quit`, `openFileDialog`, `showMessageBox`, `clipboardReadText`, `clipboardWriteText`, `clipboardReadImage`, `clipboardWriteImage`, `clipboardClear`, `clipboardAvailableFormats`, `paths.*`

### Session
`Session.fromPartition(name)`, `Session.defaultSession`, `session.cookies.set/get/remove/clear`

### Screen
`Screen.getPrimaryDisplay()`, `Screen.getAllDisplays()`, `Screen.getCursorScreenPoint()`

### GlobalShortcut
`GlobalShortcut.register(accelerator, handler)`, `GlobalShortcut.unregister(accelerator)`, `GlobalShortcut.unregisterAll()`

### Updater
`Updater.getLocal`, `Updater.onStatusChange`, `Updater.checkForUpdate`, `Updater.downloadUpdate`, `Updater.updateInfo`, `Updater.applyUpdate`, `Updater.getStatusHistory`, `Updater.clearStatusHistory`

Updater status values: `checking`, `update-available`, `downloading`, `update-ready`, `no-update`, `error`

### View-side (electrobun/view)
`Electroview.defineRPC(schema)`, `new Electroview({ rpc })`, `electrobun.rpc.request.*`, `electrobun.rpc.send.*`, `evaluateJavascriptWithResponse({ script })`

## Platform Caveats to Document in Tests

Always add a `platformCaveats` array when a test is platform-specific:

```typescript
platformCaveats: ["macOS only"],
platformCaveats: ["requires CEF renderer"],
platformCaveats: ["unreliable on Linux window managers"],
platformCaveats: ["ARM Windows: commented out due to VM crashes"],
```

## Generating and Validating After Changes

```bash
cd kitchen

# After adding new defineTest() calls:
npx tsx scripts/generate-manifest.ts

# Verify everything is consistent:
npx tsx scripts/validate-manifest.ts
# Checks:
# 1. Every test in index.ts has manifest entries
# 2. Every playground route with a test is represented
# 3. All entries have required fields
# 4. No duplicate IDs
```
