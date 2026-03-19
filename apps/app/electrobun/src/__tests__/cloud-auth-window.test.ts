import { describe, expect, it } from "vitest";
import {
  type CloudAuthWindowLike,
  CloudAuthWindowManager,
  type CreateCloudAuthWindowOptions,
  isTrustedElizaUrl,
  readNavigationEventUrl,
} from "../cloud-auth-window";

class FakeCloudWindow implements CloudAuthWindowLike {
  focusCount = 0;
  closeCount = 0;
  loadedUrls: string[] = [];
  private handlers: Record<"close" | "focus", Array<() => void>> = {
    close: [],
    focus: [],
  };
  readonly webview = {
    handlers: {
      "dom-ready": [] as Array<(event?: unknown) => void>,
      "will-navigate": [] as Array<(event?: unknown) => void>,
      "host-message": [] as Array<(event?: unknown) => void>,
    },
    loadURL: (url: string) => {
      this.loadedUrls.push(url);
    },
    on: (
      event: "dom-ready" | "will-navigate" | "host-message",
      handler: (event?: unknown) => void,
    ) => {
      this.webview.handlers[event].push(handler);
    },
  };

  focus(): void {
    this.focusCount += 1;
    this.emit("focus");
  }

  close(): void {
    this.closeCount += 1;
    this.emit("close");
  }

  on(event: "close" | "focus", handler: () => void): void {
    this.handlers[event].push(handler);
  }

  emit(event: "close" | "focus"): void {
    for (const handler of this.handlers[event]) {
      handler();
    }
  }

  emitWebview(
    event: "dom-ready" | "will-navigate" | "host-message",
    payload?: unknown,
  ): void {
    for (const handler of this.webview.handlers[event]) {
      handler(payload);
    }
  }
}

describe("isTrustedElizaUrl", () => {
  it("accepts Eliza Cloud and ElizaOS hosts over http(s)", () => {
    expect(isTrustedElizaUrl("https://www.elizacloud.ai/login")).toBe(true);
    expect(isTrustedElizaUrl("https://elizacloud.ai/dashboard/eliza")).toBe(
      true,
    );
    expect(
      isTrustedElizaUrl("https://billing.elizacloud.ai/dashboard/eliza"),
    ).toBe(true);
    expect(isTrustedElizaUrl("https://www.elizaos.ai/auth/cli-login")).toBe(
      true,
    );
  });

  it("rejects non-cloud or non-http(s) URLs", () => {
    expect(isTrustedElizaUrl("https://milady.ai")).toBe(false);
    expect(isTrustedElizaUrl("mailto:test@example.com")).toBe(false);
    expect(isTrustedElizaUrl("not-a-url")).toBe(false);
  });
});

describe("readNavigationEventUrl", () => {
  it("reads raw url fields and Electrobun event detail payloads", () => {
    expect(readNavigationEventUrl("https://www.elizacloud.ai/login")).toBe(
      "https://www.elizacloud.ai/login",
    );
    expect(
      readNavigationEventUrl({
        url: "https://www.elizacloud.ai/dashboard/eliza",
      }),
    ).toBe("https://www.elizacloud.ai/dashboard/eliza");
    expect(
      readNavigationEventUrl({
        data: { detail: "https://www.elizacloud.ai/__milady_close_window__" },
      }),
    ).toBe("https://www.elizacloud.ai/__milady_close_window__");
  });
});

describe("CloudAuthWindowManager", () => {
  it("creates a sandboxed Eliza Cloud window for the first cloud URL", () => {
    const created: CreateCloudAuthWindowOptions[] = [];
    const focused: FakeCloudWindow[] = [];
    const manager = new CloudAuthWindowManager({
      createWindow: (options) => {
        created.push(options);
        return new FakeCloudWindow();
      },
      onWindowFocused: (window) => {
        focused.push(window as FakeCloudWindow);
      },
    });

    const handled = manager.open(
      "https://www.elizacloud.ai/login?returnTo=%2Fdashboard%2Feliza",
    );

    expect(handled).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      title: "Eliza Cloud",
      url: "https://www.elizacloud.ai/login?returnTo=%2Fdashboard%2Feliza",
      titleBarStyle: "default",
      transparent: false,
      sandbox: true,
      frame: { x: 220, y: 140, width: 1280, height: 900 },
    });
    expect(created[0].preload).toContain("host-message");
    expect(created[0].preload).toContain("window.close");
    expect(focused).toHaveLength(1);
  });

  it("accepts trusted ElizaOS URLs in the same in-app window", () => {
    const window = new FakeCloudWindow();
    const manager = new CloudAuthWindowManager({
      createWindow: () => window,
    });

    expect(manager.open("https://www.elizaos.ai/auth/cli-login")).toBe(true);
    expect(manager.open("https://docs.elizaos.ai/getting-started")).toBe(true);
    expect(window.loadedUrls).toEqual([
      "https://docs.elizaos.ai/getting-started",
    ]);
    expect(window.focusCount).toBe(1);
  });

  it("closes the auth window when the preload emits a close host-message", () => {
    const window = new FakeCloudWindow();
    const manager = new CloudAuthWindowManager({
      createWindow: () => window,
    });

    expect(manager.open("https://www.elizacloud.ai/login")).toBe(true);
    window.emitWebview("host-message", {
      data: {
        detail: {
          type: "milady.trusted-eliza-window.close",
        },
      },
    });

    expect(window.closeCount).toBe(1);
  });

  it("accepts stringified host-message payloads from Electrobun", () => {
    const window = new FakeCloudWindow();
    const manager = new CloudAuthWindowManager({
      createWindow: () => window,
    });

    expect(manager.open("https://www.elizacloud.ai/login")).toBe(true);
    window.emitWebview("host-message", {
      data: {
        detail: JSON.stringify({
          type: "milady.trusted-eliza-window.close",
        }),
      },
    });

    expect(window.closeCount).toBe(1);
  });

  it("ignores unrelated host messages", () => {
    const window = new FakeCloudWindow();
    const manager = new CloudAuthWindowManager({
      createWindow: () => window,
    });

    expect(manager.open("https://www.elizacloud.ai/login")).toBe(true);
    window.emitWebview("host-message", {
      data: {
        detail: {
          type: "milady.trusted-eliza-window.noop",
        },
      },
    });

    expect(window.closeCount).toBe(0);
  });

  it("keeps navigation payload parsing for main-window guards", () => {
    expect(
      readNavigationEventUrl({
        data: { detail: "https://www.elizacloud.ai/login" },
      }),
    ).toBe("https://www.elizacloud.ai/login");
  });

  it("reuses the existing window for later cloud URLs", () => {
    const window = new FakeCloudWindow();
    const manager = new CloudAuthWindowManager({
      createWindow: () => window,
    });

    expect(manager.open("https://www.elizacloud.ai/login")).toBe(true);
    expect(manager.open("https://www.elizacloud.ai/dashboard/eliza")).toBe(
      true,
    );

    expect(window.loadedUrls).toEqual([
      "https://www.elizacloud.ai/dashboard/eliza",
    ]);
    expect(window.focusCount).toBe(1);
  });

  it("creates a new window after the previous one closes", () => {
    const created: FakeCloudWindow[] = [];
    const manager = new CloudAuthWindowManager({
      createWindow: () => {
        const window = new FakeCloudWindow();
        created.push(window);
        return window;
      },
    });

    expect(manager.open("https://www.elizacloud.ai/login")).toBe(true);
    created[0].close();

    expect(manager.open("https://www.elizacloud.ai/dashboard/eliza")).toBe(
      true,
    );
    expect(created).toHaveLength(2);
  });

  it("ignores non-cloud URLs", () => {
    const manager = new CloudAuthWindowManager({
      createWindow: () => new FakeCloudWindow(),
    });

    expect(manager.open("https://milady.ai")).toBe(false);
  });
});
