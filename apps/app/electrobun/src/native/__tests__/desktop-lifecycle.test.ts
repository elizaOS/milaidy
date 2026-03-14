import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockEvents, mockTrayInstance, MockTray } = vi.hoisted(() => {
  const hoistedEvents = {
    on: vi.fn(),
    off: vi.fn(),
  };

  const hoistedTrayInstance = {
    on: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
    setTitle: vi.fn(),
    setImage: vi.fn(),
    setMenu: vi.fn(),
  };

  return {
    mockEvents: hoistedEvents,
    mockTrayInstance: hoistedTrayInstance,
    // biome-ignore lint/complexity/useArrowFunction: constructor mock requires regular function
    MockTray: vi.fn(function (_options?: unknown) {
      return hoistedTrayInstance;
    }),
  };
});

vi.mock("../mac-window-effects", () => ({
  isAppActive: vi.fn(() => false),
  isKeyWindow: vi.fn(() => false),
  makeKeyAndOrderFront: vi.fn(() => true),
  orderOut: vi.fn(() => true),
}));

vi.mock("electrobun/bun", () => ({
  default: { events: mockEvents },
  Electrobun: { events: mockEvents },
  Tray: MockTray,
  GlobalShortcut: {
    register: vi.fn(),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
    isRegistered: vi.fn(() => false),
  },
  Screen: {
    getPrimaryDisplay: vi.fn(() => ({
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      scaleFactor: 2,
      isPrimary: true,
    })),
    getAllDisplays: vi.fn(() => []),
    getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })),
  },
  Updater: {
    localInfo: {
      version: vi.fn(() => "1.0.0"),
    },
  },
  Utils: {
    paths: {
      home: "/mock/home",
      appData: "/mock/appdata",
      userData: "/mock/userdata",
      userCache: "/mock/usercache",
      userLogs: "/mock/userlogs",
      temp: "/tmp",
      cache: "/mock/cache",
      logs: "/mock/logs",
      config: "/mock/config",
      documents: "/mock/documents",
      downloads: "/mock/downloads",
      desktop: "/mock/desktop",
      pictures: "/mock/pictures",
      music: "/mock/music",
      videos: "/mock/videos",
    },
    quit: vi.fn(),
    openExternal: vi.fn(),
    showItemInFolder: vi.fn(),
    clipboardWriteText: vi.fn(),
    clipboardReadText: vi.fn(() => ""),
    clipboardReadImage: vi.fn(() => null),
    clipboardWriteImage: vi.fn(),
    clipboardClear: vi.fn(),
    showNotification: vi.fn(),
    showMessageBox: vi.fn(() => Promise.resolve({ response: 0 })),
    openFileDialog: vi.fn(() => Promise.resolve([])),
  },
}));

import { DesktopManager } from "../desktop";

function setPlatform(value: string): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}

function createWindow() {
  return {
    on: vi.fn(),
    off: vi.fn(),
    isMaximized: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    show: vi.fn(),
    focus: vi.fn(),
  };
}

describe("DesktopManager lifecycle cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPlatform("linux");
  });

  afterEach(() => {
    setPlatform("darwin");
  });

  it("unregisters tray and global handlers when the tray is destroyed", async () => {
    const manager = new DesktopManager();

    await manager.createTray({ icon: "/icon.png" });
    await manager.destroyTray();

    expect(mockTrayInstance.off).toHaveBeenCalledWith(
      "tray-clicked",
      expect.any(Function),
    );
    expect(mockEvents.off).toHaveBeenCalledWith(
      "application-menu-clicked",
      expect.any(Function),
    );
    expect(mockEvents.off).toHaveBeenCalledWith(
      "context-menu-clicked",
      expect.any(Function),
    );
  });

  it("removes listeners from the previous window before switching windows", () => {
    const manager = new DesktopManager();
    const firstWindow = createWindow();
    const secondWindow = createWindow();

    manager.setMainWindow(firstWindow as never);
    manager.setMainWindow(secondWindow as never);

    expect(firstWindow.off).toHaveBeenCalledWith("focus", expect.any(Function));
    expect(firstWindow.off).toHaveBeenCalledWith("blur", expect.any(Function));
    expect(firstWindow.off).toHaveBeenCalledWith("close", expect.any(Function));
    expect(firstWindow.off).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
    expect(firstWindow.off).toHaveBeenCalledWith("move", expect.any(Function));
  });

  it("dispose() tears down window and tray listeners", async () => {
    const manager = new DesktopManager();
    const window = createWindow();

    manager.setMainWindow(window as never);
    await manager.createTray({ icon: "/icon.png" });
    manager.dispose();

    expect(window.off).toHaveBeenCalledWith("focus", expect.any(Function));
    expect(window.off).toHaveBeenCalledWith("blur", expect.any(Function));
    expect(window.off).toHaveBeenCalledWith("close", expect.any(Function));
    expect(window.off).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(window.off).toHaveBeenCalledWith("move", expect.any(Function));
    expect(mockEvents.off).toHaveBeenCalledWith(
      "application-menu-clicked",
      expect.any(Function),
    );
    expect(mockEvents.off).toHaveBeenCalledWith(
      "context-menu-clicked",
      expect.any(Function),
    );
  });
});
