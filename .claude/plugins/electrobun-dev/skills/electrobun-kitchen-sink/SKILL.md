---
name: Electrobun Kitchen Sink
description: Use when working with the Electrobun Kitchen Sink testing app — running tests, understanding the feature manifest, navigating the test runner UI, operating playground windows, or adding new test coverage. Also activates for questions about the defineTest() pattern, AUTO_RUN mode, or the manifest generator/validator scripts.
version: 1.0.0
---

# Electrobun Kitchen Sink

The Kitchen Sink is Electrobun's integration test app. It contains automated and interactive tests for every Electrobun API, plus standalone playground windows for manual exploration.

## Project Layout

```
kitchen/
├── scripts/
│   ├── generate-manifest.ts   # static parser → feature-manifest.json
│   └── validate-manifest.ts   # consistency checks
├── src/
│   ├── bun/index.ts           # Electrobun bun-side entrypoint
│   ├── generated/
│   │   ├── manifest-types.ts  # TypeScript types for the manifest
│   │   └── feature-manifest.json  # generated feature index
│   ├── test-framework/        # test executor & result types
│   ├── test-runner/           # test runner UI (views://test-runner/)
│   ├── test-harness/          # webview used by automated tests
│   ├── tests/
│   │   ├── index.ts           # aggregates all suites
│   │   ├── *.test.ts          # automated test suites
│   │   └── interactive/       # interactive test suites
│   └── playgrounds/           # standalone feature demo windows
└── electrobun.config.ts
```

## Running the Kitchen Sink

```bash
cd kitchen && bun install

# Dev mode — opens test runner window
electrobun dev

# Watch mode — auto-rebuilds on file change
electrobun dev --watch

# Auto-run all automated tests and exit (CI / headless)
AUTO_RUN=1 electrobun dev

# Run a single test by name
AUTO_RUN_TEST_NAME="Window creation with URL" electrobun dev
```

Exit codes: `0` = all pass, `1` = any failure.

## Feature Manifest

Generated at `kitchen/src/generated/feature-manifest.json`. Each entry:

```jsonc
{
  "id": "window-creation-with-url",         // stable slug
  "title": "Window creation with URL",      // human-readable
  "category": "BrowserWindow",              // API grouping
  "description": "Test creating a window with a URL",
  "interactive": false,                     // true = requires human input
  "testFile": "src/tests/window.test.ts",   // source location
  "playgroundRoute": null,                  // e.g. "playgrounds/clipboard/index.html"
  "apiSurface": ["BrowserWindow"],          // Electrobun APIs exercised
  "uiSelectors": [],                        // CSS selectors used in playground
  "platformCaveats": []                     // e.g. ["requires CEF renderer"]
}
```

### Regenerate / Validate

```bash
cd kitchen
npx tsx scripts/generate-manifest.ts   # parse defineTest() calls, write manifest
npx tsx scripts/validate-manifest.ts   # check all tests have manifest entries, no dups
```

Generator does **static analysis only** — no Electrobun runtime required.

## Test Suites

### Automated (run unattended)
| Suite | Key APIs |
|---|---|
| RPC | BrowserView.defineRPC, Electroview.defineRPC |
| BrowserWindow | new BrowserWindow, all lifecycle methods |
| Navigation | setNavigationRules, will-navigate, did-navigate |
| Utils | clipboard, paths, openFileDialog, showNotification |
| Screen | getPrimaryDisplay, getAllDisplays, getCursorScreenPoint |
| Session | Session.fromPartition, cookies |
| Events | Electrobun.events.on (all global events) |
| Preload | preload script injection |
| Updater | checkForUpdate, downloadUpdate, applyUpdate |
| Sandbox | sandbox: true isolation |
| Tray | new Tray, setMenu, tray-clicked |
| WGPU FFI | WGPUBridge low-level FFI |
| WGPU Adapter | GpuWindow, WGPUView adapter layer |
| Babylon Adapter | BabylonJS WebGPU integration |
| WGPU Adapter Extended | extended WGPU surface coverage |

### Interactive (require human)
| Suite | Feature area |
|---|---|
| Dialogs | openFileDialog, showMessageBox |
| Tray | Tray visibility, icon, menu |
| Shortcuts | GlobalShortcut register/unregister |
| Webview Tag | `<electrobun-webview>` masks, passthrough, navigation |
| Clipboard | clipboardRead/WriteText/Image |
| Menus | ApplicationMenu, ContextMenu |
| Window Events | move, resize, blur, focus events |
| Chromeless | titleBarStyle: hidden, draggable regions |
| Multiwindow CEF | CEF renderer multi-window |
| Quit test | before-quit lifecycle |
| Webview settings | renderer options, sandbox |
| Webview cleanup | view lifecycle and removal |
| WGPU View | WGPUView interactive |
| WGPU Tag | `<wgpu-view>` HTML tag |
| Fullsize frame repro | window frame edge cases |

## Test Runner UI — CSS Selectors

Main window: `views://test-runner/index.html`

### Controls
| Selector | Action |
|---|---|
| `#btn-run-all` | `runAllAutomated()` — runs all non-interactive tests |
| `#btn-run-interactive` | `runInteractiveTests()` |
| `.run-btn[data-test-id]` | `runTest({ testId })` — run one test |
| `#test-search` | Fuzzy filter by name/category/description |
| `#update-btn` | `applyUpdate()` |
| `#update-history-toggle` | Toggle update status history panel |
| `#update-history-clear` | `clearUpdateStatusHistory()` |

### Status elements
| Selector | Shows |
|---|---|
| `#total-count` | Total test count |
| `#passed-count` | Passed |
| `#failed-count` | Failed |
| `#pending-count` | Pending/not-run |
| `#test-list` | Category groups + test cards |
| `#search-meta` | Total or filtered count |

### Interactive modal
| Selector | Purpose |
|---|---|
| `#interactive-modal` | Modal container |
| `#modal-title` | Test name |
| `#modal-instructions` | Instructions text |
| `#btn-start` | `submitReady({ testId })` |
| `#btn-pass` | `submitVerification({ testId, action: 'pass' })` |
| `#btn-fail` | `submitVerification({ testId, action: 'fail' })` |
| `#btn-retest` | `submitVerification({ testId, action: 'retest' })` |
| `#notes-input` | Optional notes |

## Bun↔UI RPC Contract

### Requests (bun exposes to UI)
- `getTests()` → test list
- `runTest({ testId })` → run one test
- `runAllAutomated()` → run all automated
- `runInteractiveTests()` → start interactive sequence
- `submitInteractiveResult({ testId, passed, notes })` → submit result
- `submitReady({ testId })` → signal ready for interactive step
- `submitVerification({ testId, action, notes })` → pass/fail/retest
- `applyUpdate()` → apply downloaded update
- `getUpdateStatusHistory()` / `clearUpdateStatusHistory()`
- `getTestRunnerPreferences()` / `setTestRunnerPreferences({ searchQuery })`

### Messages (bun sends to UI)
- `testStarted` — test execution began
- `testCompleted` — result with pass/fail/duration
- `testLog` — log line
- `allCompleted` — all tests done
- `interactiveWaiting` — waiting for user to click Start
- `interactiveReady` — user ready, perform the action
- `interactiveVerify` — show pass/fail/retest controls
- `buildConfig` — app metadata
- `updateStatus` / `updateStatusEntry` — updater state

## Interactive Test Flow (Two-Step)

```
1. User clicks Open on an interactive test
2. Runner shows modal: instructions + #btn-start
3. User reads instructions, clicks Start → submitReady()
4. A secondary playground window opens (bun-side)
5. User performs the described action in that window
6. Modal shows: #btn-pass, #btn-fail, #btn-retest
7. User marks result → submitVerification()
8. Modal closes, result recorded
```

## Consuming the Manifest (agent usage)

```bash
# Read the manifest
cat kitchen/src/generated/feature-manifest.json

# Filter: automated tests only
jq '[.[] | select(.interactive == false)]' feature-manifest.json

# Filter: tests for a specific API
jq '[.[] | select(.apiSurface | contains(["BrowserWindow"]))]' feature-manifest.json

# Map test to source file
jq '.[] | select(.id == "window-creation-with-url") | .testFile' feature-manifest.json
```

## Playground Windows

Each interactive suite opens a dedicated playground window. Key ones:

| Playground | URL | Key Controls |
|---|---|---|
| File dialog | `views://playgrounds/file-dialog/` | `#openDialogBtn`, `#result`, `#history` |
| App menu | `views://playgrounds/application-menu/` | Sets app menu via RPC |
| Context menu | `views://playgrounds/context-menu/` | Shows context menu via RPC |
| Webview tag | `views://playgrounds/webviewtag/` | masks, passthrough, navigation |
| Session/partition | `views://playgrounds/session/` | Compares cross-partition localStorage |
| Window events | `views://playgrounds/window-events-*/` | move/resize/blur/focus detection |
| Clipboard | `views://playgrounds/clipboard/` | read/write text and image |
| Tray | `views://playgrounds/tray/` | tray icon and menu |

## Platform Caveats in Tests

- **Zoom**: exact zoom level only verified on macOS; defaults to `1.0` on other platforms
- **Minimize/unminimize**: marked unreliable on some Linux window managers
- **Session cookies**: some tests commented out due to ARM Windows VM crashes
- **Application menus**: intentionally skipped on Linux in interactive tests
- **Context menus**: marked macOS-only in interactive tests
- **CEF devtools**: only available in `dev` builds, at `http://localhost:9222`
