import { describe, expect, it, vi } from "vitest";
import { buildCommands, DESKTOP_COMMAND_CLICK_AUDIT } from "./index";

describe("buildCommands", () => {
  it("adds desktop commands when the desktop runtime is available", () => {
    const openDesktopSettingsWindow = vi.fn();
    const openDesktopSurfaceWindow = vi.fn();
    const focusDesktopMainWindow = vi.fn();

    const commands = buildCommands({
      agentState: "running",
      activeGameViewerUrl: "",
      handleStart: vi.fn(),
      handleStop: vi.fn(),
      handleRestart: vi.fn(),
      setTab: vi.fn(),
      setAppsSubTab: vi.fn(),
      loadPlugins: vi.fn(),
      loadSkills: vi.fn(),
      loadLogs: vi.fn(),
      loadWorkbench: vi.fn(),
      handleChatClear: vi.fn(),
      openBugReport: vi.fn(),
      desktopRuntime: true,
      focusDesktopMainWindow,
      openDesktopSettingsWindow,
      openDesktopSurfaceWindow,
    });

    const desktopCommands = commands.filter((command) =>
      command.id.startsWith("desktop-"),
    );

    expect(desktopCommands.map((command) => command.id)).toEqual(
      DESKTOP_COMMAND_CLICK_AUDIT.map((item) => item.id),
    );

    desktopCommands
      .find((command) => command.id === "desktop-open-workspace")
      ?.action();
    desktopCommands
      .find((command) => command.id === "desktop-command-browser")
      ?.action();
    desktopCommands
      .find((command) => command.id === "desktop-focus-main-window")
      ?.action();

    expect(openDesktopSettingsWindow).toHaveBeenCalledWith("desktop");
    expect(openDesktopSurfaceWindow).toHaveBeenCalledWith("browser");
    expect(focusDesktopMainWindow).toHaveBeenCalledTimes(1);
  });

  it("swaps start and stop commands based on agent state", () => {
    const startCommands = buildCommands({
      agentState: "stopped",
      activeGameViewerUrl: "",
      handleStart: vi.fn(),
      handleStop: vi.fn(),
      handleRestart: vi.fn(),
      setTab: vi.fn(),
      setAppsSubTab: vi.fn(),
      loadPlugins: vi.fn(),
      loadSkills: vi.fn(),
      loadLogs: vi.fn(),
      loadWorkbench: vi.fn(),
      handleChatClear: vi.fn(),
      openBugReport: vi.fn(),
      desktopRuntime: false,
      focusDesktopMainWindow: vi.fn(),
      openDesktopSettingsWindow: vi.fn(),
      openDesktopSurfaceWindow: vi.fn(),
    });
    const stopCommands = buildCommands({
      agentState: "running",
      activeGameViewerUrl: "",
      handleStart: vi.fn(),
      handleStop: vi.fn(),
      handleRestart: vi.fn(),
      setTab: vi.fn(),
      setAppsSubTab: vi.fn(),
      loadPlugins: vi.fn(),
      loadSkills: vi.fn(),
      loadLogs: vi.fn(),
      loadWorkbench: vi.fn(),
      handleChatClear: vi.fn(),
      openBugReport: vi.fn(),
      desktopRuntime: false,
      focusDesktopMainWindow: vi.fn(),
      openDesktopSettingsWindow: vi.fn(),
      openDesktopSurfaceWindow: vi.fn(),
    });

    expect(startCommands.some((command) => command.id === "start-agent")).toBe(
      true,
    );
    expect(startCommands.some((command) => command.id === "stop-agent")).toBe(
      false,
    );
    expect(stopCommands.some((command) => command.id === "stop-agent")).toBe(
      true,
    );
  });
});
