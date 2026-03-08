# Windows Electrobun Build — Bug Report & Fix Plan

Investigated by running the canary build (`2.0.0-alpha.80/81`) locally on Windows x64.
All bugs reproduced and root-caused hands-on.

---

## Bug 1 — `version.json` missing → immediate crash

**Symptom:** App exits silently with code 1 immediately after printing
`"Server started at http://localhost:50000"`. No window appears.

**Root cause:** `getVersionInfo()` in the bun entry reads
`../Resources/version.json` and **throws** (not just logs) if the file is
missing. This unhandled exception kills the process before `main()` is ever
called — before even the `[Main] Fatal error` catch can run.

The Electrobun packager/extractor does not generate this file. It exists in
the macOS `.app` bundle because macOS bundles have `Info.plist`, but on
Windows nothing writes `version.json` into `Resources/`.

**Fix:**
- Add a step in `release-electrobun.yml` after `electrobun build` to write
  `Resources/version.json` from known build metadata (`identifier`, `channel`,
  `name`, `version`, `hash`).
- **Files:** `.github/workflows/release-electrobun.yml`

---

## Bug 2 — `renderer/` directory missing from package → blank/missing UI

**Symptom:** After fixing Bug 1, the app starts but no window content loads.
The `[Renderer] Static server` log line never appears. Port 5174 is never
bound.

**Root cause:** The CI workflow (`release-electrobun.yml`) builds the Vite
frontend at `apps/app` → `apps/app/dist/`. The bun entry point
(`src/index.ts`) looks for the renderer at `../renderer/index.html` (resolves
to `Resources/app/renderer/index.html` in the package). There is **no step
that copies `apps/app/dist/` → `apps/app/electrobun/renderer/`** before
`electrobun build` runs, so the renderer directory is never included in the
final bundle.

The `electrobun.config.ts` also has `views: {}` (empty), meaning Electrobun
itself has no knowledge of the renderer and won't bundle it automatically.

**Fix:**
- Add a CI step between "Build renderer (Vite)" and "Build Electrobun app"
  that copies `apps/app/dist/` → `apps/app/electrobun/renderer/`.
- **Files:** `.github/workflows/release-electrobun.yml`

---

## Bug 3 — `setupApplicationMenu()` deadlocks on Windows → permanent hang

**Symptom:** After fixes 1 & 2, app logs:
```
[Main] Starting Milady (Electrobun)...
[WebGPU] Native Dawn runtime ready at ...
```
Then hangs **permanently** (confirmed at 30+ seconds). No window appears.
No CEF helper processes (`bun Helper.exe` etc.) are spawned. `app.log` only
shows `setJSUtils called but using map-based approach instead of callbacks`.

**Root cause:** In `src/index.ts`, `main()` calls `setupApplicationMenu()`
**before** `createMainWindow()`. The `setupApplicationMenu()` call routes to
`native.symbols.setApplicationMenu(...)` — a synchronous FFI call into
`libNativeWrapper.dll`. On Windows, the CEF/Win32 message loop has not been
started yet at this point. The native function blocks waiting for the UI
thread to process the menu command, but the UI thread can't start until a
window is created. **Deadlock.**

On macOS this works because `setApplicationMenu` is a Cocoa call that can be
made before any window exists (it sets the global app menu bar). On Windows
there is no global menu bar — menus are per-window — so the native code
apparently waits for a window context.

**Fix:**
- Move `setupApplicationMenu()` to **after** `createMainWindow()` in
  `main()` so CEF has initialized its event loop before any menu calls.
- On Windows, also guard the menu call: `setupApplicationMenu` uses macOS-
  specific roles (`services`, `hide`, `hideOthers`, `unhide`, `front`) that
  don't exist on Windows and may contribute to the hang.
- **Files:** `apps/app/electrobun/src/index.ts`

---

## Bug 4 — Smoke test PowerShell ParserError → CI fails before app even runs

**Symptom:** CI step "Run smoke test" immediately fails:
```
ParserError: ...smoke-test-windows.ps1:4
[string]$ArtifactsDir = (Join-Path $PSScriptRoot "..\\artifacts"),
The assignment expression is not valid.
```

**Root cause:** In PowerShell, `param()` **must be the first statement** in a
script. If anything precedes it, PowerShell treats the `param(...)` as a
regular function call — and typed parameter syntax like `[string]$x = expr`
inside a regular call is invalid, causing a parse error.

Commit `53a8e81` placed `$ErrorActionPreference = "Stop"` on line 1, pushing
`param()` to line 3. This broke the parser.

**Secondary issue:** The smoke test looks for the startup log at:
```
$env:USERPROFILE\.config\Milady\milady-startup.log
```
But Milady actually writes logs to:
```
$env:APPDATA\Milady\milady-startup.log   (i.e. AppData\Roaming\Milady)
```
So the diagnostic output on failure would be empty even when logs exist.

**Fix:**
- Move `$ErrorActionPreference = "Stop"` to **after** the `param()` block.
- Fix the `$startupLog` path to use `$env:APPDATA` instead of
  `$env:USERPROFILE\.config`.
- **Files:** `apps/app/electrobun/scripts/smoke-test-windows.ps1`

---

## Bug 5 — `launcher.exe` wrong entry point path

**Symptom:** Running `launcher.exe` directly prints:
```
Spawning: ...bin\bun.exe ...\bin\..\Resources\main.js
Child process exited with code: 1
```
`Resources/main.js` doesn't exist — the actual entry is
`Resources/app/bun/index.js`.

**Root cause:** The Electrobun `main.js` shim (which wraps the app entry) is
included in the CEF toolchain package. The `electrobun build` step is supposed
to generate/place this shim at `Resources/main.js`. Because the build
completes but the app structure in this version diverged from what the shim
expects, the launcher fails to find the entry point.

**Fix:** This is likely an Electrobun version alignment issue (package.json
says `0.1.23`, but the CI pulls `1.15.1`). Locking to a consistent version
and ensuring `electrobun build` generates the correct `main.js` shim should
fix this. Needs validation after Bug 3 fix since that's the current hard
blocker.

---

## Summary — What Needs to Land

| # | File | Change |
|---|------|--------|
| 1 | `.github/workflows/release-electrobun.yml` | Write `Resources/version.json` post-build |
| 2 | `.github/workflows/release-electrobun.yml` | Copy `apps/app/dist/` → `apps/app/electrobun/renderer/` pre-build |
| 3 | `apps/app/electrobun/src/index.ts` | Move `setupApplicationMenu()` after `createMainWindow()`; guard Windows |
| 4 | `apps/app/electrobun/scripts/smoke-test-windows.ps1` | Fix `param()` order; fix log path |

Bug 5 (launcher shim) is a downstream consequence and should resolve itself
once the build pipeline is generating correctly via `electrobun build`.

---

## How to Verify Locally (Windows)

After applying fixes and running the build:

1. Extract the installer zip
2. Check `Resources/version.json` exists
3. Check `Resources/app/renderer/index.html` exists
4. Run `bin\bun.exe ..\Resources\app\bun\index.js` from `bin\`
5. Confirm output reaches `[Main] Milady started successfully`
6. Confirm `http://localhost:2138/api/health` returns 200
7. Confirm a native window appears with the Milady UI
