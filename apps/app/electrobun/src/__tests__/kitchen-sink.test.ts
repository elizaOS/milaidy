/**
 * Kitchen Sink Interactive Tests
 *
 * These tests exercise features that require a real Electrobun runtime and
 * cannot be run in the standard unit-test environment. They are wrapped in
 * describe.skip so they don't run in CI, but serve as a living checklist for
 * manual / integration testing sessions.
 *
 * To run a specific block during development:
 *   bun run test --reporter=verbose kitchen-sink
 */

import { describe, it } from "vitest";

// ============================================================================
// INTERACTIVE: Canvas windows
// ============================================================================

describe.skip("INTERACTIVE: Canvas windows", () => {
  it.todo("canvasCreateWindow — creates a visible BrowserWindow");
  it.todo("canvasNavigate — loads a localhost URL in the canvas");
  it.todo("canvasEval — executes JS and returns result");
  it.todo("canvasSnapshot — returns a base64 PNG of the canvas area");
  it.todo("canvasShow / canvasHide — toggles window visibility");
  it.todo("canvasResize — resizes the window to the requested dimensions");
  it.todo("canvasFocus — brings the canvas window to front");
  it.todo("canvasGetBounds / canvasSetBounds — round-trips window bounds");
  it.todo("canvasListWindows — returns all open canvas windows");
  it.todo(
    "canvasOpenDevTools — opens the DevTools inspector for the canvas window",
  );
  it.todo("canvasDestroyWindow — closes the window and removes it from list");
});

// ============================================================================
// INTERACTIVE: Game windows (isolated BrowserWindow for game clients)
// ============================================================================

describe.skip("INTERACTIVE: Game windows", () => {
  it.todo(
    "gameOpenWindow — opens an external game URL in an isolated BrowserWindow",
  );
  it.todo("gameOpenWindow — returned id appears in canvasListWindows result");
  it.todo(
    "gameOpenWindow — window uses game-isolated session partition (no cookie bleed from main renderer)",
  );
  it.todo(
    "canvasDestroyWindow — closes a game window opened via gameOpenWindow",
  );
});

// INTERACTIVE: GPU companion window (GpuWindow + WGPUView)
// ============================================================================

describe.skip("INTERACTIVE: GPU companion window", () => {
  it.todo(
    "gpuWindowCreate — creates a transparent always-on-top GpuWindow with an embedded WGPUView",
  );
  it.todo("gpuWindowShow — focuses and raises the GPU companion window");
  it.todo(
    "gpuWindowHide — minimizes the GPU companion window without destroying it",
  );
  it.todo(
    "gpuWindowSetBounds — repositions/resizes the window and syncs the WGPUView frame",
  );
  it.todo(
    "gpuWindowGetInfo — returns id, frame, and wgpuViewId for an existing window",
  );
  it.todo("gpuWindowList — returns all open GPU companion windows");
  it.todo("gpuWindowDestroy — closes the window and cleans up the WGPUView");
  it.todo(
    "gpuWindowClosed push event — renderer receives gpuWindowClosed when window is closed natively",
  );

  it.todo(
    "gpuViewCreate — attaches a WGPUView to the main BrowserWindow at a given frame",
  );
  it.todo(
    "gpuViewSetFrame — resizes the WGPUView when the companion area changes",
  );
  it.todo(
    "gpuViewSetTransparent — toggles the GPU surface background transparency",
  );
  it.todo(
    "gpuViewSetHidden — shows/hides the GPU surface without destroying it",
  );
  it.todo(
    "gpuViewGetNativeHandle — returns the Metal/D3D12 layer handle for external render loop wiring",
  );
  it.todo(
    "gpuViewList — returns all WGPUViews managed by the GpuWindowManager",
  );
  it.todo("gpuViewDestroy — removes the WGPUView and frees native resources");
});
