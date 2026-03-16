# Milady Desktop Architecture Correction Plan

**Author:** Principal Engineer Architecture Review
**Date:** 2026-03-10
**Repo:** miladyai/milady v2.0.0-alpha.76
**Runtime:** Electrobun 1.15.1 (patched), Bun, WKWebView/CEF
**Scope:** Desktop architecture only (macOS primary, Linux/Windows secondary)

---

## 1. Executive Summary

Milady's Electron→Electrobun migration is structurally complete but operationally fragile. The core translation layer works: a typed RPC schema replaces Electron IPC, a bridge shims `window.electron.ipcRenderer` for backward compatibility, and 10 native singleton managers encapsulate platform features. However, the architecture carries forward significant Electron-era assumptions, introduces new single-points-of-failure (a 880-line agent subprocess manager, a 944-line dependency bundler), and produces an 823MB artifact driven by wholesale backend dist copying and unbounded native dependencies.

The system is viable. The path forward is not a rewrite but a disciplined series of corrections that reduce coupling between the Electrobun shell and the ElizaOS backend, formalize the contract between them, and systematically close the Electrobun API gaps that currently require workarounds (focus polling, window hide via minimize, stubbed powerMonitor).

**Verdict preview:** Keep Electrobun. Correct the seams. The framework choice is sound; the integration architecture needs tightening.

---

## 2. Purpose & Big Picture

### What Milady Is
A desktop AI companion application built on ElizaOS (agent runtime) with a React renderer, delivered as a native app via Electrobun. It supports three variants (base, companion, full) across macOS (primary), Linux, and Windows. The app embeds local LLM inference (node-llama-cpp), speech (whisper-node), vision (face-api.js, tensorflow), and computer-use capabilities (puppeteer-core, canvas eval).

### Why Electrobun Was Chosen
Electrobun provides Bun-native execution (no Node.js shim), native WKWebView on macOS (no Chromium overhead), bundled WGPU/Dawn for GPU compute, and a smaller baseline footprint than Electron. These are correct architectural bets for an AI-heavy desktop application that needs GPU access and local inference.

### What This Plan Solves
The migration left behind three categories of debt:

1. **Coupling debt** — The Electrobun shell, the ElizaOS backend, and the renderer are entangled through shared filesystem assumptions, wholesale dist copying, and duplicated channel mappings.
2. **Stability debt** — Electrobun API gaps force workarounds (2Hz focus polling, minimize-as-hide, stubbed APIs) that degrade user experience and complicate debugging.
3. **Size debt** — The 823MB artifact bundles the entire backend dist with all native modules for all configurations, regardless of which variant is being built.

---

## 3. Current Architecture Inventory

### 3.1 Process Model
```
┌─────────────────────────────────────────────────┐
│                  Electrobun Shell                │
│  (Bun main process — index.ts, 789 lines)       │
│                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ RPC      │  │ Native Mgrs  │  │ Agent     │  │
│  │ Handlers │→ │ (10 singles) │  │ Manager   │  │
│  │ (369 ln) │  │ desktop.ts   │  │ (880 ln)  │  │
│  └────┬─────┘  │ camera.ts    │  │ Bun.spawn │  │
│       │        │ canvas.ts    │  │ → ElizaOS │  │
│       │        │ gateway.ts   │  └─────┬─────┘  │
│       │        │ location.ts  │        │        │
│       │        │ permissions  │        │        │
│       │        │ screencap    │        │        │
│       │        │ swabble.ts   │        │        │
│       │        │ talkmode.ts  │        │        │
│       │        │ whisper.ts   │        │        │
│       │        └──────────────┘        │        │
│       │                                │        │
│  ┌────▼────────────────────────────────▼─────┐  │
│  │         Bun HTTP Server (port 5174+)      │  │
│  │  Serves renderer + proxies to ElizaOS API │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
         │ RPC (typed schema, 972 lines)
         ▼
┌─────────────────────────────────────────────────┐
│               WKWebView / CEF                    │
│  ┌──────────────────────────────────────────┐   │
│  │  electrobun-bridge.ts (480 lines)        │   │
│  │  window.electron.ipcRenderer → RPC       │   │
│  │  CHANNEL_TO_RPC mapping (duplicated)     │   │
│  └──────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────┐   │
│  │  React Renderer (Vite-built)             │   │
│  │  Capacitor plugin interfaces             │   │
│  │  Three.js / VRM / xterm                  │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
         │ HTTP (localhost:2138+)
         ▼
┌─────────────────────────────────────────────────┐
│           ElizaOS Backend (child process)        │
│  PGLite (Postgres WASM) · node-llama-cpp        │
│  sharp · whisper · face-api · tensorflow        │
│  puppeteer-core · node-pty                      │
└─────────────────────────────────────────────────┘
```

### 3.2 File Inventory (Electrobun-specific)

| File | Lines | Role |
|------|-------|------|
| `electrobun/src/index.ts` | 789 | Main entry, window, menu, FFI, startup |
| `electrobun/src/rpc-schema.ts` | 972 | Typed RPC contract (both directions) |
| `electrobun/src/rpc-handlers.ts` | 369 | Handler registry, wires managers to RPC |
| `electrobun/src/bridge/electrobun-bridge.ts` | 480 | Renderer compat layer |
| `electrobun/src/native/desktop.ts` | 1001 | Tray, shortcuts, window, clipboard, shell |
| `electrobun/src/native/agent.ts` | 880 | ElizaOS subprocess lifecycle |
| `electrobun/src/native/permissions.ts` | 208 | Cross-platform permission facade |
| `electrobun/src/native/permissions-darwin.ts` | ~150 | macOS permission checks |
| `electrobun/src/native/permissions-win32.ts` | ~100 | Windows permission checks |
| `electrobun/src/native/permissions-linux.ts` | ~80 | Linux permission checks |
| `electrobun/src/native/mac-window-effects.ts` | 126 | FFI to libMacWindowEffects.dylib |
| `electrobun/src/native/camera.ts` | ~200 | Camera device management |
| `electrobun/src/native/canvas.ts` | ~300 | Canvas window for computer-use |
| `electrobun/src/native/screencapture.ts` | ~250 | Screen capture management |
| `electrobun/src/native/gateway.ts` | ~150 | Network discovery |
| `electrobun/src/native/location.ts` | ~100 | Geolocation |
| `electrobun/src/native/swabble.ts` | ~150 | Wake word detection |
| `electrobun/src/native/talkmode.ts` | ~200 | Voice interaction |
| `electrobun/src/native/whisper.ts` | ~200 | Speech-to-text |
| `electrobun/src/native/index.ts` | 61 | Init/dispose orchestrator |
| `electrobun/src/api-base.ts` | 91 | API endpoint resolution |
| `electrobun/electrobun.config.ts` | ~120 | Build config, code signing |
| `scripts/copy-runtime-node-modules.ts` | 944 | Dependency bundler |
| `scripts/desktop-build.mjs` | ~200 | Variant/profile build orchestrator |

### 3.3 Native Dependency Surface

**Inference & ML:** node-llama-cpp, @tensorflow/tfjs-node, onnxruntime-node, face-api.js
**Media:** sharp, canvas, whisper-node
**System:** node-pty, puppeteer-core, koffi (FFI), fsevents
**Database:** @electric-sql/pglite (Postgres WASM)
**Platform bindings:** @reflink/reflink-darwin-arm64, -darwin-x64, -linux-arm64-gnu, -linux-x64-gnu

### 3.4 Build Pipeline
```
tsdown (4 entries) → dist/
  ↓
copy-runtime-node-modules.ts → dist/node_modules/ (platform-filtered)
  ↓
vite build → apps/app/dist/ (renderer)
  ↓
build:native-effects → libMacWindowEffects.dylib (macOS only)
  ↓
electrobun build → .app / .tar.zst / .dmg (823MB)
  copies: renderer dist, preload.js, entire milady-dist/, dylib
```

### 3.5 Capacitor Plugins (Electron Legacy)
Each plugin has an `electron/src/index.ts` providing Electron-specific bindings: agent, camera, canvas, desktop, gateway, location, screencapture, swabble, talkmode. These are the Electron-era implementations that the bridge layer replaces for Electrobun.

---

## 4. Problem Analysis

### P1: Agent Subprocess Fragility (Critical)
**Evidence:** `agent.ts` (880 lines) — The ElizaOS backend is spawned as a child process via `Bun.spawn()` with 7-candidate path resolution, stdout stream parsing for port detection, 120s health polling, and regex-based PGLite corruption auto-recovery. A single malformed stdout line, a port conflict, or a PATH misconfiguration causes silent startup failure with no user-visible recovery path beyond the diagnostic log at `~/.config/Milady/milady-startup.log`.

**Impact:** This is the single highest-risk component. If the agent doesn't start, the entire application is a blank shell with no functionality.

### P2: Bridge Channel Duplication (High)
**Evidence:** `electrobun-bridge.ts` duplicates the `CHANNEL_TO_RPC` and `PUSH_CHANNEL_TO_RPC` mappings from `rpc-schema.ts` because browser code cannot import server-side modules. Any change to the RPC schema requires manual synchronization of both files. There is no build-time or runtime validation that they match.

**Impact:** Drift between the two mapping sets produces silent message drops — the renderer sends a channel name that the main process doesn't recognize, or vice versa. Debugging requires cross-referencing two files.

### P3: 823MB Artifact Size (High)
**Evidence:** `electrobun.config.ts` copies the entire `milady-dist/` directory into the bundle. `copy-runtime-node-modules.ts` (944 lines) attempts platform filtering but operates on the full dependency tree. Native modules for unused features (streaming plugins, unused ML backends) are included regardless of the build variant (base/companion/full).

**Impact:** Download size, disk usage, and signing time are all inflated. First-launch experience suffers. OTA updates transfer the full delta rather than targeted patches.

### P4: Electrobun API Gaps (High)
**Evidence from desktop.ts:**
- `powerMonitor`: Returns hardcoded stubs (`on-ac`, `not-suspended`). No actual power state detection.
- `setOpacity`: No-op. Electrobun doesn't expose window opacity.
- `hide()`: Falls back to `minimize()` because Electrobun doesn't expose `orderOut`. Desktop uses FFI `orderOutWindow()` instead, but only on macOS.
- `blur events`: Unreliable. 2Hz polling via `isKeyWindow()` FFI as workaround.
- `setLoginItemSettings`: Stubbed. Auto-launch implemented manually via LaunchAgents/desktop files/registry.
- `relaunch`: Just calls `quit()`. No actual relaunch.
- `notification dismissal`: No API.
- `shell.beep`: No-op.

**Impact:** Each gap requires a platform-specific workaround that increases the code surface and diverges behavior across platforms. The focus-polling workaround at 2Hz is particularly concerning for battery life on laptops.

### P5: Singleton Testing Barrier (Medium)
**Evidence:** All 10 native managers use lazy singleton initialization (e.g., `getDesktopManager()`). The `initializeNativeModules()` function wires all of them in a fixed sequence with no dependency injection. Test files exist (`__tests__/`) but testing singletons requires module-level mocking.

**Impact:** Unit test coverage for native modules is limited. Integration tests must spin up the full Electrobun environment.

### P6: Dual Build Configurations (Medium)
**Evidence:** `tsdown.config.ts` and `tsdown.electron.config.ts` exist side by side. The Electron config adds koffi, canvas, onnxruntime-node, sharp, pglite as externals and outputs to `dist-electron/`. The main config targets the Electrobun path. Both share most logic but drift independently.

**Impact:** Changes to bundling strategy must be applied in both configs. Easy to miss one, causing runtime module resolution failures in one target but not the other.

### P7: Platform-Specific Code Sprawl (Medium)
**Evidence:** macOS FFI (mac-window-effects.ts, 126 lines), permissions-darwin/win32/linux (3 separate files), auto-launch implementations for 3 platforms in desktop.ts, LaunchAgents plist generation, .desktop file creation, Windows registry manipulation. The postwrap signing script, xcrun wrapper, and diagnostics script are macOS-only.

**Impact:** Each platform addition multiplies the maintenance surface. Linux and Windows are second-class citizens with more stubs and fewer native integrations.

### P8: Electron Legacy Persistence (Low-Medium)
**Evidence:** Each Capacitor plugin still contains `electron/src/index.ts` implementations. Test files reference Electron patterns. `tsdown.electron.config.ts` is maintained in parallel. The bridge layer's entire purpose is Electron API compatibility.

**Impact:** The Electron compatibility layer adds cognitive overhead. New developers must understand both the old Electron patterns and the new Electrobun RPC to navigate the codebase. Dead code accumulates.

---

## 5. Preserve-vs-Move Matrix

| Component | Verdict | Rationale |
|-----------|---------|-----------|
| Electrobun runtime | **PRESERVE** | Correct choice. Bun-native, WKWebView, WGPU bundling. |
| Typed RPC schema | **PRESERVE** | Sound design. Type-safe contract between processes. |
| Bridge compatibility layer | **MOVE** (phase out) | Necessary now, but should shrink as renderer migrates to direct RPC. |
| Agent subprocess model | **PRESERVE + CORRECT** | Child process isolation is correct. The 880-line manager needs decomposition. |
| Singleton managers | **CORRECT** | Keep the domain separation. Add DI for testability. |
| Native FFI (mac-window-effects) | **PRESERVE** | Necessary for macOS UX. Extend pattern to Linux/Windows where applicable. |
| copy-runtime-node-modules | **CORRECT** | Must become variant-aware. 944 lines is too much for a build script. |
| Capacitor plugin Electron dirs | **MOVE** (remove) | Dead code once Electrobun migration stabilizes. |
| Dual tsdown configs | **MOVE** (merge) | Should be a single config with target parameterization. |
| 2Hz focus polling | **MOVE** (upstream fix) | File Electrobun issue or contribute blur event support. |
| PGLite auto-recovery | **PRESERVE** | Pragmatic. Database corruption recovery is essential for local-first apps. |
| Bun HTTP server for renderer | **PRESERVE** | Avoids file:// CORS issues. Correct architecture for webview apps. |

---

## 6. Recommended Target Architecture

### 6.1 Process Boundary Formalization
Introduce a formal **Agent Protocol** between the Electrobun shell and the ElizaOS backend. Today the contract is implicit: stdout parsing for port detection, HTTP health polling, and environment variable injection. The target is a versioned protocol definition that specifies the startup handshake, health contract, and shutdown sequence.

### 6.2 Layered RPC with Generated Bridge
Replace the duplicated channel mappings with a **build-time code generation step** that reads `rpc-schema.ts` and emits the bridge mapping as a generated file included in the renderer bundle. This eliminates the synchronization problem at its root.

### 6.3 Variant-Aware Dependency Tree
Restructure the build pipeline so that `copy-runtime-node-modules.ts` receives a variant manifest specifying which native modules are required. Base variant excludes streaming, ML inference, and computer-use modules. Full variant includes everything. This is a configuration change, not an architecture change.

### 6.4 Manager Composition over Singletons
Replace the lazy singleton pattern with an explicit **ManagerRegistry** that constructs managers with injected dependencies. The registry owns the lifecycle. Tests can construct managers with mock dependencies without module-level patching.

### 6.5 Electrobun Gap Abstraction Layer
Introduce a thin **PlatformCapabilities** module that declares what each platform actually supports at runtime (not just compile time). Feature code queries capabilities rather than platform strings. When Electrobun closes a gap upstream, the capability flips without changing feature code.

### 6.6 Decomposed Agent Lifecycle
Split `agent.ts` into three focused modules:
- **AgentResolver** — Path resolution, environment setup, binary discovery
- **AgentProcess** — Subprocess spawning, I/O streaming, signal handling
- **AgentHealth** — Health polling, port detection, recovery strategies

### 6.7 Target Directory Layout
```
apps/app/electrobun/
├── src/
│   ├── main.ts                    (slimmed entry, <200 lines)
│   ├── rpc/
│   │   ├── schema.ts              (contract definition)
│   │   ├── handlers.ts            (handler registry)
│   │   └── generated/             (build-time bridge output)
│   ├── agent/
│   │   ├── resolver.ts            (path + env resolution)
│   │   ├── process.ts             (subprocess lifecycle)
│   │   └── health.ts              (polling + recovery)
│   ├── platform/
│   │   ├── capabilities.ts        (runtime capability queries)
│   │   ├── macos/                 (FFI, window effects)
│   │   ├── linux/                 (freedesktop integrations)
│   │   └── windows/               (registry, COM integrations)
│   ├── managers/
│   │   ├── registry.ts            (DI container, lifecycle)
│   │   ├── desktop.ts
│   │   ├── camera.ts
│   │   ├── canvas.ts
│   │   ├── permissions/
│   │   │   ├── facade.ts
│   │   │   └── platform/          (darwin, win32, linux impls)
│   │   └── ...
│   └── bridge/
│       └── preload.ts             (thin, generated mappings)
├── scripts/
│   └── generate-bridge.ts         (rpc-schema → bridge codegen)
└── electrobun.config.ts
```

---

## 7. Decision Log

| # | Decision | Alternatives Considered | Rationale |
|---|----------|------------------------|-----------|
| D1 | Keep Electrobun | Switch to Tauri v2, return to Electron | Tauri requires Rust; team is TypeScript/Bun. Electron adds 100MB+ Chromium. Electrobun aligns with Bun ecosystem and provides WGPU. |
| D2 | Keep child process for ElizaOS | In-process embedding, WASM sandbox | ElizaOS has native dependencies (llama-cpp, sharp) that require full OS access. Process isolation provides crash boundaries. |
| D3 | Code-generate bridge from schema | Shared constants file, runtime validation | Codegen eliminates an entire class of bugs (mapping drift) at build time with zero runtime cost. |
| D4 | Variant manifests over build profiles | Feature flags at runtime, separate repos | Build-time exclusion reduces artifact size. Runtime flags still load unused modules into memory. |
| D5 | Upstream Electrobun contributions | Fork, workaround indefinitely | Already using patched dependencies. Contributing blur events and window opacity upstream reduces local maintenance. |
| D6 | Manager DI over singletons | Service locator, global state | DI is testable, explicit, and compatible with the existing manager pattern. Low migration cost. |
| D7 | Platform capabilities over platform checks | Compile-time feature flags, #ifdef equivalents | Runtime queries adapt to Electrobun version upgrades. Feature flags are brittle across updates. |

---

## 8. Step-by-Step Correction Plan

### Phase 1: Stabilize (Weeks 1-4)

**Step 1.1: Agent Lifecycle Decomposition**
Split `agent.ts` (880 lines) into `resolver.ts`, `process.ts`, and `health.ts`. No behavior changes. Pure refactor with identical test coverage. The `start()` method currently spanning 260+ lines becomes a coordinator calling three focused subsystems.

**Step 1.2: Bridge Codegen Pipeline**
Create `scripts/generate-bridge.ts` that reads `rpc-schema.ts`, extracts `CHANNEL_TO_RPC_METHOD` and `PUSH_CHANNEL_TO_RPC_MESSAGE` mappings, and writes a `generated/bridge-mappings.ts` file. Wire into the build pipeline before `vite build`. Delete the hand-maintained duplicate in `electrobun-bridge.ts`.

**Step 1.3: Variant-Aware Module Bundling**
Add a `variant-manifest.json` schema that lists required native packages per variant. Modify `copy-runtime-node-modules.ts` to read this manifest and skip packages not in the active variant's list. Expected artifact reduction: base variant drops from ~823MB to ~400-500MB by excluding ML and streaming dependencies.

**Step 1.4: Remove Electron Legacy**
Delete all `plugins/*/electron/` directories. Remove `tsdown.electron.config.ts`. Update test infrastructure to use Electrobun-native patterns. This is safe because the Electrobun migration is functional.

### Phase 2: Harden (Weeks 5-8)

**Step 2.1: Manager Registry with DI**
Introduce `ManagerRegistry` class. Each manager constructor receives its dependencies explicitly. The registry handles initialization order and disposal. Existing `getXxxManager()` singletons become thin wrappers around the registry for backward compatibility during migration.

**Step 2.2: PlatformCapabilities Module**
Create `platform/capabilities.ts` that probes Electrobun APIs at startup and exposes a typed capabilities object. Replace all `process.platform === "darwin"` checks in feature code with capability queries. This decouples feature logic from platform detection.

**Step 2.3: Agent Protocol Specification**
Define a versioned Agent Protocol document: startup handshake (env vars → stdout ready signal → health endpoint), shutdown sequence (SIGTERM → grace period → SIGKILL), and error contracts (structured JSON on stderr instead of regex-matched strings). The agent subprocess and the shell both validate against this spec.

**Step 2.4: Focus Event Upstream Contribution**
File a detailed Electrobun issue for blur/focus event reliability on macOS. Contribute a PR if the Electrobun codebase is accessible. Provide the 2Hz polling workaround as context. If accepted upstream, remove the polling code. If rejected, encapsulate the workaround behind `PlatformCapabilities.hasFocusEvents`.

### Phase 3: Optimize (Weeks 9-12)

**Step 3.1: Main Entry Slimming**
Refactor `index.ts` (789 lines) by extracting: menu creation, window state persistence, deep link handling, and auto-updater wiring into separate modules. Target: `main.ts` under 200 lines as a pure orchestrator.

**Step 3.2: RPC Handler Domain Splitting**
Split `rpc-handlers.ts` into per-domain handler files (`rpc/agent-handlers.ts`, `rpc/desktop-handlers.ts`, etc.). The main `registerRpcHandlers` becomes a thin aggregator. Each handler file owns its domain's error handling and validation.

**Step 3.3: Build Pipeline Audit**
Profile the build pipeline end-to-end. Identify the largest time and size contributors. Implement parallel native module compilation where possible. Evaluate whether `Bun.build` can replace tsdown for the Electrobun-specific bundle.

**Step 3.4: Artifact Size Target**
Set measurable targets: base variant under 400MB, companion under 550MB, full under 700MB. Instrument the build to report per-component size contribution. Automate size regression detection in CI.

---

## 9. Milestones

| Milestone | Target | Deliverable | Success Criteria |
|-----------|--------|-------------|-----------------|
| M1: Agent Stable | Week 2 | Decomposed agent lifecycle | Agent starts reliably in <30s on cold boot, <10s warm. Zero stdout-parsing failures in smoke tests. |
| M2: Bridge Generated | Week 3 | Codegen pipeline + CI validation | `generate-bridge.ts` runs in CI. Manual bridge mapping deleted. No channel drift possible. |
| M3: Variant Bundles | Week 4 | Manifest-driven bundling | Base variant artifact under 500MB. `copy-runtime-node-modules.ts` reads manifest. |
| M4: Electron Removed | Week 4 | No Electron code paths | All `plugins/*/electron/` deleted. `tsdown.electron.config.ts` deleted. CI passes. |
| M5: DI Managers | Week 6 | Registry-based manager system | All 10 managers constructible with mock dependencies. 3+ manager unit tests added. |
| M6: Platform Caps | Week 7 | Capability-driven platform code | Zero `process.platform` checks in feature code outside `platform/` directory. |
| M7: Agent Protocol | Week 8 | Versioned protocol spec | Startup handshake validated in integration test. Structured error reporting on stderr. |
| M8: Slim Main | Week 10 | `main.ts` < 200 lines | Entry point is pure orchestration. All concerns extracted to dedicated modules. |
| M9: Size Targets | Week 12 | Per-variant artifact sizes | base < 400MB, companion < 550MB, full < 700MB. Size reported in CI. |

---

## 10. Validation & Acceptance Criteria

### Functional Validation
- Agent subprocess starts and reaches healthy state within 30s on M4 MacBook Air
- All RPC channels round-trip correctly (renderer → main → renderer)
- System tray, global shortcuts, auto-launch work on macOS
- Window show/hide/focus works without FFI regressions on macOS
- PGLite corruption recovery triggers and completes successfully
- Deep links (`milady://`) route correctly

### Build Validation
- `bun run build:desktop` completes without errors for all three variants
- Variant manifests correctly exclude/include native modules
- Generated bridge file is byte-identical when schema hasn't changed (deterministic codegen)
- Code signing and notarization pass on macOS

### Regression Validation
- Existing smoke tests pass (`smoke-test.sh`, `smoke-test-windows.ps1`)
- Electron plugin entrypoint e2e tests are replaced with Electrobun equivalents
- Permission checks work on all three platforms
- No new `any` type escapes in RPC handler registration

### Size Validation
- Artifact size measured and reported per variant per commit
- Size regression > 5% blocks merge without explicit approval
- Native module inventory matches variant manifest exactly

---

## 11. Risks & Traps

### R1: Electrobun Upstream Abandonment
**Risk:** Electrobun is a relatively young project. If development stalls, Milady is locked to a patched fork.
**Mitigation:** The typed RPC schema and manager architecture are framework-agnostic. A migration to Tauri v2 or Neutralinojs would replace the shell layer without rewriting business logic. Keep the coupling surface small.

### R2: Agent Subprocess Race Conditions
**Risk:** The agent manager's stdout parsing, health polling, and status callbacks create multiple concurrent async flows that can race during rapid start/stop/restart cycles.
**Mitigation:** The decomposition in Step 1.1 introduces explicit state machine transitions. Each state transition is atomic and logged.

### R3: Bridge Codegen Divergence from Runtime
**Risk:** The generated bridge file is a build artifact. If the build pipeline skips generation, the runtime uses stale mappings.
**Mitigation:** CI validation step that regenerates the bridge and diffs against the committed version. Fail on mismatch.

### R4: PGLite Corruption Frequency
**Risk:** The auto-recovery path deletes the entire database at `~/.milady/workspace/.eliza/.elizadb`. If PGLite corruption is frequent, users lose data repeatedly.
**Mitigation:** Add telemetry counting recovery events. If frequency exceeds threshold, investigate root cause (likely unclean shutdown during WASM execution). Consider WAL-mode or periodic backup.

### R5: Native Module Version Skew
**Risk:** `copy-runtime-node-modules.ts` resolves versions from Bun's internal package layout. Bun version upgrades can change the layout, breaking resolution.
**Mitigation:** Pin Bun version in CI. Add integration test that validates resolved module versions match expectations.

### R6: macOS FFI Pointer Safety
**Risk:** The FFI wrapper passes opaque `Pointer` values from Electrobun's `BrowserWindow` to native dylib functions. If the window is destroyed while an FFI call is in flight, the pointer is dangling.
**Mitigation:** Add pointer validity checks in the dylib (Objective-C `isKindOfClass:` guard). Never cache pointers across event loop ticks.

### R7: 120s Agent Startup Timeout
**Risk:** On first run, PGLite WASM initialization takes significant time. The 120s timeout may not be enough on older hardware, or may be unnecessarily long on fast machines.
**Mitigation:** Replace fixed timeout with adaptive approach: emit progress events from the agent subprocess so the shell can display startup progress to the user and make informed timeout decisions.

---

## 12. Concrete File Map

### Files to Create
```
electrobun/src/agent/resolver.ts         — Extract from agent.ts lines 1-120 (path resolution)
electrobun/src/agent/process.ts          — Extract from agent.ts lines 121-500 (subprocess mgmt)
electrobun/src/agent/health.ts           — Extract from agent.ts lines 501-770 (health + recovery)
electrobun/src/rpc/generated/.gitkeep    — Generated bridge output directory
electrobun/src/platform/capabilities.ts  — Runtime capability probing
electrobun/src/managers/registry.ts      — DI container for managers
electrobun/scripts/generate-bridge.ts    — Bridge codegen from rpc-schema
variant-manifests/base.json             — Native module list for base variant
variant-manifests/companion.json        — Native module list for companion variant
variant-manifests/full.json             — Native module list for full variant
```

### Files to Modify
```
electrobun/src/index.ts                  — Slim from 789 → <200 lines
electrobun/src/rpc-handlers.ts           — Split into per-domain files
electrobun/src/native/agent.ts           — Replace with agent/ directory imports
electrobun/src/native/desktop.ts         — Replace platform checks with capability queries
electrobun/src/native/index.ts           — Use ManagerRegistry instead of manual init
electrobun/src/bridge/electrobun-bridge.ts — Import generated mappings
scripts/copy-runtime-node-modules.ts     — Add manifest parameter, variant filtering
electrobun/electrobun.config.ts          — Reference variant-specific copy lists
package.json                             — Update build scripts for codegen step
```

### Files to Delete
```
apps/app/plugins/agent/electron/         — Legacy Electron plugin impl
apps/app/plugins/camera/electron/        — Legacy Electron plugin impl
apps/app/plugins/canvas/electron/        — Legacy Electron plugin impl
apps/app/plugins/desktop/electron/       — Legacy Electron plugin impl
apps/app/plugins/gateway/electron/       — Legacy Electron plugin impl
apps/app/plugins/location/electron/      — Legacy Electron plugin impl
apps/app/plugins/screencapture/electron/ — Legacy Electron plugin impl
apps/app/plugins/swabble/electron/       — Legacy Electron plugin impl
apps/app/plugins/talkmode/electron/      — Legacy Electron plugin impl
tsdown.electron.config.ts               — Merged into main config
```

---

## 13. First PR Recommendation

**PR Title:** `refactor(electrobun): decompose agent lifecycle into resolver/process/health modules`

**Why this first:** The agent subprocess manager is the highest-risk component (P1). Decomposing it is a pure refactor with no behavior changes, making it safe to land early. It unlocks testability for the most critical code path and establishes the directory pattern for subsequent extraction work.

**Scope:**
- Create `electrobun/src/agent/` directory with three files extracted from `native/agent.ts`
- `resolver.ts`: `resolveMiladyDistPath()`, `resolveBunExecutablePath()`, `resolveElizaEntryPath()`, `getMiladyDistFallbackCandidates()` — approximately 120 lines
- `process.ts`: `AgentProcess` class wrapping `Bun.spawn()`, stdout/stderr handling, `killChildProcess()`, `monitorChildExit()` — approximately 300 lines
- `health.ts`: `AgentHealth` class with `waitForReady()`, `pollHealth()`, `fetchAgentName()`, PGLite recovery logic — approximately 250 lines
- `native/agent.ts` becomes a thin `AgentManager` that composes the three modules — approximately 200 lines (down from 880)
- Update `native/index.ts` and `rpc-handlers.ts` imports (no behavior change)
- Add unit tests for `resolver.ts` (path resolution with mock filesystem)

**Estimated effort:** 2-3 days for one engineer familiar with the codebase.

**Risk:** Low. Pure extraction refactor. If any test breaks, the decomposition introduced a bug.

---

## 14. ExecPlan

```
EXEC PLAN — Milady Desktop Architecture Correction
═══════════════════════════════════════════════════

PHASE 1: STABILIZE (Weeks 1-4)
────────────────────────────────
Week 1:
  [1.1] Decompose agent.ts → agent/resolver + agent/process + agent/health
        Owner: Senior engineer
        Depends: Nothing
        Blocks: 2.3 (Agent Protocol)
        Validation: All smoke tests pass, agent starts in <30s

Week 2:
  [1.2] Bridge codegen pipeline
        Owner: Build engineer
        Depends: Nothing (parallel with 1.1)
        Blocks: Nothing (enables drift-free development)
        Validation: Generated file matches hand-written, CI check added

Week 3:
  [1.3] Variant-aware module bundling
        Owner: Build engineer
        Depends: Nothing (parallel with 1.1, 1.2)
        Blocks: 3.4 (Size targets)
        Validation: base variant < 500MB

Week 4:
  [1.4] Remove Electron legacy code
        Owner: Any engineer
        Depends: 1.2 (bridge codegen proves Electrobun path works)
        Blocks: Nothing
        Validation: No electron/ directories remain, CI passes

PHASE 2: HARDEN (Weeks 5-8)
────────────────────────────
Week 5-6:
  [2.1] Manager Registry with DI
        Owner: Senior engineer
        Depends: 1.1 (agent decomposition establishes pattern)
        Blocks: Nothing
        Validation: 3+ managers unit-tested with mocked deps

Week 6-7:
  [2.2] PlatformCapabilities module
        Owner: Senior engineer
        Depends: Nothing (parallel with 2.1)
        Blocks: 2.4 (focus event upstream)
        Validation: Zero process.platform checks outside platform/

Week 7-8:
  [2.3] Agent Protocol specification
        Owner: Senior engineer + tech writer
        Depends: 1.1 (agent decomposition)
        Blocks: Nothing (informational until integration test)
        Validation: Protocol doc reviewed, integration test validates handshake

Week 8:
  [2.4] Electrobun upstream: focus events
        Owner: Senior engineer
        Depends: 2.2 (capability abstraction ready)
        Blocks: Nothing (best-effort)
        Validation: Issue filed, PR submitted if feasible

PHASE 3: OPTIMIZE (Weeks 9-12)
──────────────────────────────
Week 9-10:
  [3.1] Main entry slimming (index.ts 789 → <200 lines)
        Owner: Any engineer
        Depends: 2.1 (registry established)
        Blocks: Nothing
        Validation: main.ts < 200 lines, all features work

Week 10-11:
  [3.2] RPC handler domain splitting
        Owner: Any engineer
        Depends: Nothing (parallel with 3.1)
        Blocks: Nothing
        Validation: Per-domain handler files, aggregator < 50 lines

Week 11-12:
  [3.3] Build pipeline audit + optimization
        Owner: Build engineer
        Depends: 1.3 (variant bundling), 3.1 (slimmed main)
        Blocks: 3.4
        Validation: Build time measured, bottlenecks identified

Week 12:
  [3.4] Artifact size targets enforced
        Owner: Build engineer
        Depends: 1.3, 3.3
        Blocks: Nothing (ongoing enforcement)
        Validation: base < 400MB, companion < 550MB, full < 700MB, CI gate

DEPENDENCY GRAPH:
  1.1 ──→ 2.1 ──→ 3.1
   │               │
   └──→ 2.3        │
                    │
  1.2 ──→ 1.4      │
                    │
  1.3 ──────────→ 3.3 ──→ 3.4
                    │
  2.2 ──→ 2.4      │
                    │
  3.2 ─────────────┘

PARALLEL TRACKS:
  Track A (Agent):    1.1 → 2.3 → (complete)
  Track B (Build):    1.2 + 1.3 → 1.4 → 3.3 → 3.4
  Track C (Arch):     2.1 → 3.1
  Track D (Platform): 2.2 → 2.4
  Track E (RPC):      3.2 (independent)
```

---

## 15. Final Verdict

**Keep Electrobun. Correct the architecture. Do not rewrite.**

The Electrobun migration was the right strategic decision. Bun-native execution, WKWebView on macOS, and bundled WGPU/Dawn are genuine advantages for an AI desktop application that runs local inference. The typed RPC schema is a material improvement over Electron's stringly-typed IPC. The bridge compatibility layer, while temporary, means the renderer didn't need to be rewritten in lockstep.

The problems are integration problems, not framework problems. The 823MB artifact, the 880-line agent manager, the duplicated channel mappings, the 2Hz focus polling — none of these are caused by Electrobun being the wrong choice. They're caused by a migration that prioritized functional completeness over architectural cleanliness. That's the correct order of operations for a migration. Now it's time for the cleanup pass.

The three highest-leverage corrections are:

1. **Agent lifecycle decomposition** — Reduces the blast radius of the most critical component from 880 lines to three focused ~200-line modules. Makes the startup path testable and debuggable.

2. **Bridge codegen** — Eliminates an entire class of silent bugs (channel mapping drift) with a build-time guarantee. Zero runtime cost.

3. **Variant-aware bundling** — Turns the 823MB monolithic artifact into right-sized bundles per variant. The infrastructure already exists in `copy-runtime-node-modules.ts`; it just needs a manifest input.

The 12-week plan is conservative. A focused team of 2-3 engineers can execute it without disrupting feature development because every step is a non-breaking refactor. No behavior changes until Phase 3. No new features required. Just disciplined extraction, generation, and composition applied to code that already works.

The Electrobun bet is sound. The integration architecture needs tightening. This plan tightens it.
