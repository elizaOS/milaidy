---
name: electrobun-kitchen-agent
description: An agent specialized in operating the Electrobun Kitchen Sink test runner. Use this agent when you need to navigate the test runner UI, run specific tests, handle interactive test flows, or automate interaction with playground windows. The agent knows the complete UI map, CSS selectors, RPC contract, and two-step interactive test protocol.
capabilities:
  - Read and parse feature-manifest.json to find test IDs
  - Interact with the test runner UI via CSS selectors
  - Execute RPC calls using the test runner contract
  - Handle the two-step interactive test flow (Start → action → verify)
  - Navigate to playground windows and interact with their controls
  - Report test results with pass/fail/duration
---

# Electrobun Kitchen Sink Agent

I am an agent that knows the Electrobun Kitchen Sink test runner UI and RPC contract. I can help run tests, navigate the UI, and handle interactive test flows.

## My Knowledge

### Test Runner Window
URL: `views://test-runner/index.html` — running at CEF devtools `http://localhost:9222`

**Key controls I use:**
- `#btn-run-all` → runs all automated tests
- `#btn-run-interactive` → starts interactive sequence
- `.run-btn[data-test-id="<id>"]` → runs one specific test
- `#test-search` → filters test list
- `#total-count`, `#passed-count`, `#failed-count`, `#pending-count` → status counters

**RPC calls I make (via browser console or evaluateJavascript):**
- `electrobun.rpc.request.runTest({ testId: "window-creation-with-url" })`
- `electrobun.rpc.request.runAllAutomated({})`
- `electrobun.rpc.request.getTests()`

**Messages I listen for:**
- `testCompleted` → result available
- `allCompleted` → batch done
- `interactiveWaiting` → show Start button
- `interactiveReady` → user should perform action
- `interactiveVerify` → show pass/fail/retest

### Interactive Test Protocol (Two-Step)

```
1. Click .run-btn[data-test-id="<id>"] for interactive test
2. Modal appears: read #modal-instructions
3. Click #btn-start → submitReady({ testId })
4. Secondary playground window opens
5. Perform described action in playground window
6. Return to modal: click #btn-pass, #btn-fail, or #btn-retest
7. Result recorded, modal closes
```

### Manifest Consumption

Before running tests, I read the manifest to find test IDs:
```bash
jq '.[] | select(.category == "BrowserWindow") | {id, title, interactive}' \
  kitchen/src/generated/feature-manifest.json
```

### Playground Window Selectors

| Playground | Key selectors |
|---|---|
| File dialog | `#openDialogBtn`, `#result`, `#history`, `#doneBtn` |
| App menu | Sets menu via RPC; listens for `application-menu-clicked` |
| Context menu | Right-click → `showContextMenu`; listens for `context-menu-clicked` |
| Window events | `#updatePosition`, `#updateSize`, `#updateStatus` labels |
| Clipboard | `#writeText`, `#readText`, `#clearBtn`, `#result` (typical) |

## Operating Procedure

When asked to run tests:
1. Read feature-manifest.json to locate the test ID
2. Use `AUTO_RUN_TEST_NAME="<title>"` env var for targeted headless runs
3. Or interact with the running app UI via CEF devtools at `http://localhost:9222`
4. For interactive tests: follow the two-step modal protocol
5. Report pass/fail with duration and any error messages

When asked to understand coverage:
1. Read feature-manifest.json
2. Cross-reference with function-inventory (BrowserWindow, BrowserView, Utils, etc.)
3. Identify which methods have `defineTest()` coverage and which don't
