import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ejectPluginAction } from "../../actions/eject-plugin";
import { listEjectedAction } from "../../actions/list-ejected";
import { reinjectPluginAction } from "../../actions/reinject-plugin";
import { requestRestart } from "../../runtime/restart";
import {
  ejectPlugin,
  listEjectedPlugins,
  reinjectPlugin,
} from "../../services/plugin-eject";

vi.mock("../../services/plugin-eject", () => ({
  ejectPlugin: vi.fn(),
  reinjectPlugin: vi.fn(),
  listEjectedPlugins: vi.fn(),
}));

vi.mock("../../runtime/restart", () => ({
  requestRestart: vi.fn(),
}));

describe("plugin eject/reinject/list actions", () => {
  const mockEjectPlugin = vi.mocked(ejectPlugin);
  const mockReinjectPlugin = vi.mocked(reinjectPlugin);
  const mockListEjectedPlugins = vi.mocked(listEjectedPlugins);
  const mockRequestRestart = vi.mocked(requestRestart);

  beforeEach(() => {
    vi.useRealTimers();
    mockEjectPlugin.mockReset();
    mockReinjectPlugin.mockReset();
    mockListEjectedPlugins.mockReset();
    mockRequestRestart.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("ejectPluginAction", () => {
    it("requires a plugin id", async () => {
      const result = await ejectPluginAction.handler(
        undefined,
        { roomId: "room", content: { text: "" } },
        undefined,
        undefined,
      );

      expect(result.success).toBe(false);
      expect(result.text).toContain("I need a plugin ID to eject.");
      expect(mockEjectPlugin).not.toHaveBeenCalled();
      expect(mockRequestRestart).not.toHaveBeenCalled();
    });

    it("trims plugin id and schedules restart on successful eject", async () => {
      vi.useFakeTimers();
      mockEjectPlugin.mockResolvedValue({
        success: true,
        pluginName: "discord",
        ejectedPath: "/tmp/discord-fork",
        removedFiles: 0,
        upstreamVersion: "2.0.0",
        pluginDir: "/tmp/discord-fork",
        commitHash: "abc123",
        upstreamCommits: 0,
        localChanges: false,
      });

      const result = await ejectPluginAction.handler(
        undefined,
        { roomId: "room", content: { text: "" } },
        undefined,
        { parameters: { pluginId: "  discord  " } },
      );

      expect(mockEjectPlugin).toHaveBeenCalledWith("discord");
      expect(result.success).toBe(true);
      expect(result.text).toContain("Ejected discord to /tmp/discord-fork");
      expect(mockRequestRestart).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1100);
      expect(mockRequestRestart).toHaveBeenCalledOnce();
      expect(mockRequestRestart).toHaveBeenCalledWith("Plugin discord ejected");
    });

    it("returns failure text when eject fails", async () => {
      mockEjectPlugin.mockResolvedValue({
        success: false,
        error: "already ejected",
      });

      const result = await ejectPluginAction.handler(
        undefined,
        { roomId: "room", content: { text: "" } },
        undefined,
        { parameters: { pluginId: "discord" } },
      );

      expect(result.success).toBe(false);
      expect(result.text).toContain("Failed to eject discord: already ejected");
      expect(mockRequestRestart).not.toHaveBeenCalled();
    });
  });

  describe("reinjectPluginAction", () => {
    it("requires a plugin id", async () => {
      const result = await reinjectPluginAction.handler(
        undefined,
        { roomId: "room", content: { text: "" } },
        undefined,
        undefined,
      );

      expect(result.success).toBe(false);
      expect(result.text).toContain("I need a plugin ID to reinject.");
      expect(mockReinjectPlugin).not.toHaveBeenCalled();
      expect(mockRequestRestart).not.toHaveBeenCalled();
    });

    it("trims plugin id and schedules restart on successful reinject", async () => {
      vi.useFakeTimers();
      mockReinjectPlugin.mockResolvedValue({
        success: true,
        pluginName: "discord",
        removedPath: "/tmp/discord-fork",
      });

      const result = await reinjectPluginAction.handler(
        undefined,
        { roomId: "room", content: { text: "" } },
        undefined,
        { parameters: { pluginId: "  discord  " } },
      );

      expect(mockReinjectPlugin).toHaveBeenCalledWith("discord");
      expect(result.success).toBe(true);
      expect(result.text).toContain("Removed ejected plugin discord.");
      expect(mockRequestRestart).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1100);
      expect(mockRequestRestart).toHaveBeenCalledOnce();
      expect(mockRequestRestart).toHaveBeenCalledWith(
        "Plugin discord reinjected",
      );
    });

    it("returns failure text when reinject fails", async () => {
      mockReinjectPlugin.mockResolvedValue({
        success: false,
        error: "not ejected",
      });

      const result = await reinjectPluginAction.handler(
        undefined,
        { roomId: "room", content: { text: "" } },
        undefined,
        { parameters: { pluginId: "discord" } },
      );

      expect(result.success).toBe(false);
      expect(result.text).toContain("Failed to reinject discord: not ejected");
      expect(mockRequestRestart).not.toHaveBeenCalled();
    });
  });

  describe("listEjectedAction", () => {
    it("returns a friendly message when no plugins exist", async () => {
      mockListEjectedPlugins.mockResolvedValue([]);

      const result = await listEjectedAction.handler(
        undefined,
        { roomId: "room", content: { text: "" } },
        undefined,
      );

      expect(result.success).toBe(true);
      expect(result.text).toBe("No ejected plugins found.");
      expect(result.data).toMatchObject({ count: 0, plugins: [] });
    });

    it("formats plugin entries including branch when present", async () => {
      mockListEjectedPlugins.mockResolvedValue([
        {
          name: "@elizaos/plugin-discord",
          path: "/tmp/plugins/ejected/_elizaos_plugin-discord",
          version: "2.0.0",
          upstream: {
            $schema: "milaidy-upstream-v1",
            branch: "develop",
            gitUrl: "https://github.com/elizaos-plugins/plugin-discord",
            commitHash: "abc",
            source: "github:elizaos-plugins/plugin-discord",
            npmPackage: "@elizaos/plugin-discord",
            npmVersion: "2.0.0",
            lastSyncAt: null,
            localCommits: 0,
          },
        },
        {
          name: "@elizaos/plugin-telegram",
          path: "/tmp/plugins/ejected/_elizaos_plugin-telegram",
          version: "1.0.0",
          upstream: {
            $schema: "milaidy-upstream-v1",
            gitUrl: "https://github.com/elizaos-plugins/plugin-telegram",
            commitHash: "def",
            source: "github:elizaos-plugins/plugin-telegram",
            npmPackage: "@elizaos/plugin-telegram",
            npmVersion: "1.0.0",
            localCommits: 0,
            lastSyncAt: null,
          },
        },
      ]);

      const result = await listEjectedAction.handler(
        undefined,
        { roomId: "room", content: { text: "" } },
        undefined,
      );

      expect(result.success).toBe(true);
      expect(result.text).toContain("Ejected plugins (2):");
      expect(result.text).toContain(
        "- @elizaos/plugin-discord@develop (/tmp/plugins/ejected/_elizaos_plugin-discord)",
      );
      expect(result.text).toContain(
        "- @elizaos/plugin-telegram (/tmp/plugins/ejected/_elizaos_plugin-telegram)",
      );
      expect(result.data).toMatchObject({ count: 2 });
      expect(result.data.plugins).toHaveLength(2);
    });
  });
});
