# Electron desktop app: startup and exception handling

This doc explains how the embedded agent starts in the packaged desktop app and **why** the exception-handling guards in `apps/app/electron/src/native/agent.ts` must not be removed.

## Startup sequence

1. **API server** — Load `milady-dist/server.js` and call `startApiServer()`. The UI needs this port to connect; it is started first so the window can bootstrap.
2. **Runtime bootstrap** — Load `milady-dist/eliza.js` (dynamic import) and get `startEliza`.
3. **Runtime start** — Call `startEliza({ headless: true })`. This initializes plugins, native modules (e.g. onnxruntime-node), and the ElizaOS runtime.

If step 2 or 3 fails (missing native binary, plugin error, etc.), we want:

- The **API server to stay up** so the renderer can still hit `http://localhost:2138`.
- **Status** to be set to `state: "error"` with `port` and `error` message so the UI can show "Agent unavailable: …" instead of a generic "Failed to fetch".

## Why the guards exist

**Goal:** When the runtime fails to load (e.g. missing native binary), the user should see a clear error in the UI, not a dead window. That requires (1) the API server to stay up so the renderer can connect, and (2) status to include `state: "error"` and the error message so the UI can show "Agent unavailable: …".

Without explicit handling:

1. **`eliza.js` import fails** (e.g. `onnxruntime-node` can't find `darwin/x64/onnxruntime_binding.node`). The dynamic import throws.
2. The **outer `catch`** in `start()` runs. Previously it closed the API server and set error state.
3. The **renderer** never gets a valid port; `window.__MILADY_API_BASE__` is never set or the server is gone. The UI shows "Failed to fetch" with no explanation.

So we added:

- **`.catch()` on the `eliza.js` dynamic import** — Return `null` instead of throwing. Then we set `state: "error"` and **do not** tear down the API server.
- **try/catch around `startEliza({ headless: true })`** — Same idea: catch runtime init failures, set error state, keep the server.
- **Outer catch does NOT call `this.apiClose()`** — So a failure after the API server has started does not kill the server; the renderer can still connect and show the error.

## Do not remove as "excess"

Code reviews or automated "deslop" passes sometimes remove try/catch or `.catch()` as "redundant" or "excess exception handling." In this module, those guards are **intentional**: they keep the app window usable when the runtime fails to load. Removing them would bring back the broken behavior (dead window, "Failed to fetch", no error message).

The file and key sites in `agent.ts` include **WHY** comments that reference this doc. When editing that file, preserve the guards and the rationale.

## Logs

Packaged app writes a startup log to:

- **macOS:** `~/Library/Application Support/Milady/milady-startup.log`
- **Windows:** `%APPDATA%\Milady\milady-startup.log`
- **Linux:** `~/.config/Milady/milady-startup.log`

Use it to debug load failures (missing modules, native binary path, etc.).

## See also

- [Plugin resolution and NODE_PATH](./plugin-resolution-and-node-path.md) — why dynamic plugin imports need `NODE_PATH` and where it's set.
- [Build and release](./build-and-release.md) — CI pipeline, Rosetta builds, plugin/dep copying.
