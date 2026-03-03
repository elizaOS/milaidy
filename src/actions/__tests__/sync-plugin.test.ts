import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncPluginAction } from "../../actions/sync-plugin";
import { syncPlugin } from "../../services/plugin-eject";

vi.mock("../../services/plugin-eject", () => {
  return {
    syncPlugin: vi.fn(),
  };
});

describe("syncPluginAction", () => {
  const mockSyncPlugin = vi.mocked(syncPlugin);

  beforeEach(() => {
    mockSyncPlugin.mockReset();
  });

  it("should require a plugin ID", async () => {
    const result = await syncPluginAction.handler(
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("plugin ID");
    expect(mockSyncPlugin).not.toHaveBeenCalled();
  });

  it("should trim the plugin ID before syncing", async () => {
    mockSyncPlugin.mockResolvedValue({
      success: true,
      pluginName: "discord",
      upstreamCommits: 2,
      conflicts: [],
    });

    const result = await syncPluginAction.handler(
      undefined,
      undefined,
      undefined,
      { parameters: { pluginId: "  discord  " } },
    );

    expect(mockSyncPlugin).toHaveBeenCalledWith("discord");
    expect(result.success).toBe(true);
    expect(result.text).toContain("Synced discord");
  });

  it("should surface conflicts when sync fails", async () => {
    mockSyncPlugin.mockResolvedValue({
      success: false,
      pluginName: "discord",
      upstreamCommits: 0,
      conflicts: ["src/index.ts"],
      error: "merge conflict",
    });

    const result = await syncPluginAction.handler(
      undefined,
      undefined,
      undefined,
      { parameters: { pluginId: "discord" } },
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("merge conflict");
    expect(result.text).toContain("Conflicts: src/index.ts");
    expect(result.data).toMatchObject({ success: false });
  });

  it("should report upstream commit count on success", async () => {
    mockSyncPlugin.mockResolvedValue({
      success: true,
      pluginName: "telegram-enhanced",
      upstreamCommits: 5,
      conflicts: [],
    });

    const result = await syncPluginAction.handler(
      undefined,
      undefined,
      undefined,
      { parameters: { pluginId: "telegram-enhanced" } },
    );

    expect(result.success).toBe(true);
    expect(result.text).toContain("telegram-enhanced");
    expect(result.text).toContain("5 upstream commits");
    expect(result.data).toMatchObject({ success: true });
  });
});
