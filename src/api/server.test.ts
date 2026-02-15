import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("@elizaos/core", () => {
  return {
    logger: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    ChannelType: {},
    createMessageMemory: vi.fn(),
    stringToUuid: vi.fn(),
  };
});

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("../config/config.js", () => ({
  loadMilaidyConfig: vi.fn().mockReturnValue({}),
  configFileExists: vi.fn(),
  saveMilaidyConfig: vi.fn(),
}));

vi.mock("../cloud/cloud-manager.js", () => ({
  CloudManager: class {},
}));

vi.mock("../services/agent-export.js", () => ({
  exportAgent: vi.fn(),
  importAgent: vi.fn(),
  estimateExportSize: vi.fn(),
}));

vi.mock("../services/app-manager.js", () => ({
  AppManager: class {},
}));

vi.mock("../services/mcp-marketplace.js", () => ({
  getMcpServerDetails: vi.fn(),
  searchMcpMarketplace: vi.fn(),
}));

vi.mock("../services/skill-marketplace.js", () => ({
  installMarketplaceSkill: vi.fn(),
  listInstalledMarketplaceSkills: vi.fn(),
  searchSkillsMarketplace: vi.fn(),
  uninstallMarketplaceSkill: vi.fn(),
}));

vi.mock("./cloud-routes.js", () => ({
  handleCloudRoute: vi.fn(),
}));

vi.mock("./database.js", () => ({
  handleDatabaseRoute: vi.fn(),
}));

vi.mock("./plugin-validation.js", () => ({
  validatePluginConfig: vi.fn(),
}));

vi.mock("./wallet.js", () => ({
  fetchEvmBalances: vi.fn(),
}));

describe("captureEarlyLogs", () => {
  beforeEach(async () => {
    vi.resetModules();
    // Reset logger to fresh spies because captureEarlyLogs mutates it in place
    const { logger } = await import("@elizaos/core");
    logger.info = vi.fn();
    logger.debug = vi.fn();
    logger.warn = vi.fn();
    logger.error = vi.fn();

    // Also we need to clear the internal state of server.js (earlyLogBuffer).
    // resetting modules does that for the module scope variables.
  });

  it("patches the global logger", async () => {
    const { logger } = await import("@elizaos/core");
    const { captureEarlyLogs } = await import("./server.js");
    const originalInfo = logger.info;

    captureEarlyLogs();

    expect(logger.info).not.toBe(originalInfo);
  });

  it("calls the original logger after buffering", async () => {
    const { logger } = await import("@elizaos/core");
    const { captureEarlyLogs } = await import("./server.js");

    const originalInfo = logger.info;

    captureEarlyLogs();

    // Call the patched logger
    logger.info("test message");

    // The wrapper calls original(...args).
    expect(originalInfo).toHaveBeenCalledWith("test message");
  });

  it("does not patch twice", async () => {
    const { logger } = await import("@elizaos/core");
    const { captureEarlyLogs } = await import("./server.js");

    captureEarlyLogs();
    const patchedInfo = logger.info;

    captureEarlyLogs();
    expect(logger.info).toBe(patchedInfo);
  });
});
