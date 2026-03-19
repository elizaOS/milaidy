import { describe, expect, it } from "vitest";
import {
  buildSurfaceShellQuery,
  SurfaceWindowManager,
  type CreateManagedWindowOptions,
  type ManagedWindowLike,
} from "../surface-windows";

class FakeWindow implements ManagedWindowLike {
  focusCount = 0;
  private handlers: Record<"close" | "focus", Array<() => void>> = {
    close: [],
    focus: [],
  };
  readonly webview = {
    handlers: [] as Array<() => void>,
    on: (_event: "dom-ready", handler: () => void) => {
      this.webview.handlers.push(handler);
    },
  };

  focus() {
    this.focusCount += 1;
    this.emit("focus");
  }

  on(event: "close" | "focus", handler: () => void): void {
    this.handlers[event].push(handler);
  }

  emit(event: "close" | "focus"): void {
    for (const handler of this.handlers[event]) {
      handler();
    }
  }

  emitDomReady(): void {
    for (const handler of this.webview.handlers) {
      handler();
    }
  }
}

describe("SurfaceWindowManager", () => {
  it("reuses the singleton settings window", async () => {
    const created: FakeWindow[] = [];
    const manager = new SurfaceWindowManager({
      createWindow: (_options: CreateManagedWindowOptions) => {
        const window = new FakeWindow();
        created.push(window);
        return window;
      },
      resolveRendererUrl: async () => "http://localhost:5173",
      readPreload: () => "preload.js",
      wireRpc: () => undefined,
      injectApiBase: () => undefined,
    });

    const first = await manager.openSettingsWindow("open-settings-plugins");
    const second = await manager.openSettingsWindow("open-settings-connectors");

    expect(created).toHaveLength(1);
    expect(first.id).toBe(second.id);
    expect(created[0].focusCount).toBe(1);
    expect(manager.listWindows("settings")).toHaveLength(1);
  });

  it("creates multiple detached windows for non-settings surfaces", async () => {
    const manager = new SurfaceWindowManager({
      createWindow: (_options: CreateManagedWindowOptions) => new FakeWindow(),
      resolveRendererUrl: async () => "http://localhost:5173",
      readPreload: () => "preload.js",
      wireRpc: () => undefined,
      injectApiBase: () => undefined,
    });

    await manager.openSurfaceWindow("chat");
    await manager.openSurfaceWindow("chat");
    await manager.openSurfaceWindow("plugins");
    await manager.openSurfaceWindow("cloud");

    expect(manager.listWindows("chat").map((entry) => entry.title)).toEqual([
      "Milady Chat",
      "Milady Chat 2",
    ]);
    expect(manager.listWindows("plugins").map((entry) => entry.title)).toEqual([
      "Milady Plugins",
    ]);
    expect(manager.listWindows("cloud").map((entry) => entry.title)).toEqual([
      "Milady Cloud",
    ]);
  });

  it("notifies when the registry changes on create, focus, and close", async () => {
    const created: FakeWindow[] = [];
    let changes = 0;
    const manager = new SurfaceWindowManager({
      createWindow: (_options: CreateManagedWindowOptions) => {
        const window = new FakeWindow();
        created.push(window);
        return window;
      },
      resolveRendererUrl: async () => "http://localhost:5173",
      readPreload: () => "preload.js",
      wireRpc: () => undefined,
      injectApiBase: () => undefined,
      onRegistryChanged: () => {
        changes += 1;
      },
    });

    const first = await manager.openSurfaceWindow("triggers");
    expect(changes).toBe(1);

    manager.focusWindow(first.id);
    expect(changes).toBeGreaterThanOrEqual(2);

    created[0].emit("close");
    expect(manager.listWindows()).toHaveLength(0);
    expect(changes).toBeGreaterThanOrEqual(3);
  });
});

describe("buildSurfaceShellQuery", () => {
  it("builds the settings shell query with a normalized tab", () => {
    expect(buildSurfaceShellQuery("settings", "open-settings-plugins")).toBe(
      "?shell=settings&tab=plugins",
    );
  });

  it("builds detached surface shell queries", () => {
    expect(buildSurfaceShellQuery("plugins")).toBe(
      "?shell=surface&tab=plugins",
    );
    expect(buildSurfaceShellQuery("triggers")).toBe(
      "?shell=surface&tab=triggers",
    );
    expect(buildSurfaceShellQuery("cloud")).toBe("?shell=surface&tab=cloud");
  });
});
