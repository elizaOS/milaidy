/**
 * Unit tests for navigation.ts — tab routing, path mapping, and tab groups.
 *
 * Regression tests are marked with [REGRESSION] and document bugs that have
 * previously caused real breakage.
 */

import { describe, expect, it } from "vitest";
import {
  ALL_TAB_GROUPS,
  type Tab,
  getTabGroups,
  pathForTab,
  tabFromPath,
  titleForTab,
} from "./navigation";

// ---------------------------------------------------------------------------
// tabFromPath
// ---------------------------------------------------------------------------

describe("tabFromPath", () => {
  // Root
  it("/ → chat", () => expect(tabFromPath("/")).toBe("chat"));
  it("empty string → chat", () => expect(tabFromPath("")).toBe("chat"));
  it("/index.html → chat", () =>
    expect(tabFromPath("/index.html")).toBe("chat"));

  // Core tabs
  it("/chat → chat", () => expect(tabFromPath("/chat")).toBe("chat"));
  it("/companion → companion", () =>
    expect(tabFromPath("/companion")).toBe("companion"));
  it("/stream → stream", () => expect(tabFromPath("/stream")).toBe("stream"));
  it("/character → character", () =>
    expect(tabFromPath("/character")).toBe("character"));
  it("/character-select → character-select", () =>
    expect(tabFromPath("/character-select")).toBe("character-select"));
  it("/wallets → wallets", () =>
    expect(tabFromPath("/wallets")).toBe("wallets"));
  it("/knowledge → knowledge", () =>
    expect(tabFromPath("/knowledge")).toBe("knowledge"));
  it("/connectors → connectors", () =>
    expect(tabFromPath("/connectors")).toBe("connectors"));
  it("/settings → settings", () =>
    expect(tabFromPath("/settings")).toBe("settings"));
  it("/voice → settings (alias)", () =>
    expect(tabFromPath("/voice")).toBe("settings"));

  // Advanced sub-tabs
  it("/advanced → advanced", () =>
    expect(tabFromPath("/advanced")).toBe("advanced"));
  it("/plugins → plugins", () =>
    expect(tabFromPath("/plugins")).toBe("plugins"));
  it("/skills → skills", () => expect(tabFromPath("/skills")).toBe("skills"));
  it("/actions → actions", () =>
    expect(tabFromPath("/actions")).toBe("actions"));
  it("/triggers → triggers", () =>
    expect(tabFromPath("/triggers")).toBe("triggers"));
  it("/fine-tuning → fine-tuning", () =>
    expect(tabFromPath("/fine-tuning")).toBe("fine-tuning"));
  it("/trajectories → trajectories", () =>
    expect(tabFromPath("/trajectories")).toBe("trajectories"));
  it("/runtime → runtime", () =>
    expect(tabFromPath("/runtime")).toBe("runtime"));
  it("/database → database", () =>
    expect(tabFromPath("/database")).toBe("database"));
  it("/lifo → lifo", () => expect(tabFromPath("/lifo")).toBe("lifo"));
  it("/logs → logs", () => expect(tabFromPath("/logs")).toBe("logs"));
  it("/security → security", () =>
    expect(tabFromPath("/security")).toBe("security"));

  // [REGRESSION] /workflows was missing from PATH_TO_TAB at the time of the
  // visual workflow builder PR (#876) — tabFromPath returned null, causing a
  // navigation dead-end. Ensure it resolves correctly forever.
  it("[REGRESSION] /workflows → workflows", () =>
    expect(tabFromPath("/workflows")).toBe("workflows"));

  // Case-insensitive
  it("/Workflows → workflows (case-insensitive)", () =>
    expect(tabFromPath("/Workflows")).toBe("workflows"));
  it("/ADVANCED → advanced (case-insensitive)", () =>
    expect(tabFromPath("/ADVANCED")).toBe("advanced"));

  // Legacy paths
  it("/game → apps (legacy)", () => expect(tabFromPath("/game")).toBe("apps"));
  it("/agent → character (legacy)", () =>
    expect(tabFromPath("/agent")).toBe("character"));
  it("/inventory → wallets (legacy)", () =>
    expect(tabFromPath("/inventory")).toBe("wallets"));
  it("/features → plugins (legacy)", () =>
    expect(tabFromPath("/features")).toBe("plugins"));
  it("/admin → advanced (legacy)", () =>
    expect(tabFromPath("/admin")).toBe("advanced"));
  it("/config → settings (legacy)", () =>
    expect(tabFromPath("/config")).toBe("settings"));

  // Unknown path
  it("unknown path → null", () =>
    expect(tabFromPath("/nonexistent")).toBeNull());
});

// ---------------------------------------------------------------------------
// pathForTab
// ---------------------------------------------------------------------------

describe("pathForTab", () => {
  it("chat → /chat", () => expect(pathForTab("chat")).toBe("/chat"));
  it("stream → /stream", () => expect(pathForTab("stream")).toBe("/stream"));
  it("settings → /settings", () =>
    expect(pathForTab("settings")).toBe("/settings"));
  it("advanced → /advanced", () =>
    expect(pathForTab("advanced")).toBe("/advanced"));
  it("actions → /actions", () =>
    expect(pathForTab("actions")).toBe("/actions"));

  // [REGRESSION] workflows path must round-trip through tabFromPath.
  it("[REGRESSION] workflows → /workflows", () =>
    expect(pathForTab("workflows")).toBe("/workflows"));

  it("pathForTab round-trips through tabFromPath for all tabs", () => {
    const ALL_TABS: Tab[] = [
      "chat",
      "companion",
      "stream",
      "apps",
      "character",
      "character-select",
      "wallets",
      "knowledge",
      "connectors",
      "plugins",
      "skills",
      "actions",
      "workflows",
      "triggers",
      "advanced",
      "fine-tuning",
      "trajectories",
      "runtime",
      "database",
      "lifo",
      "logs",
      "security",
    ];
    for (const tab of ALL_TABS) {
      const path = pathForTab(tab);
      const resolved = tabFromPath(path);
      expect(resolved, `pathForTab("${tab}") → "${path}" → tabFromPath`).toBe(
        tab,
      );
    }
  });

  // basePath prefix
  it("respects basePath prefix", () =>
    expect(pathForTab("chat", "/app")).toBe("/app/chat"));
  it("respects basePath prefix for workflows", () =>
    expect(pathForTab("workflows", "/app")).toBe("/app/workflows"));
});

// ---------------------------------------------------------------------------
// ALL_TAB_GROUPS / getTabGroups
// ---------------------------------------------------------------------------

describe("ALL_TAB_GROUPS", () => {
  it("Advanced group contains workflows", () => {
    const advanced = ALL_TAB_GROUPS.find((g) => g.label === "Advanced");
    expect(advanced).toBeDefined();
    expect(advanced?.tabs).toContain("workflows");
  });

  // [REGRESSION] workflows must be reachable via the Advanced tab group — if it
  // were absent, clicking the nav item would have nowhere to route.
  it("[REGRESSION] every Tab type appears in at least one group", () => {
    const allGroupedTabs = ALL_TAB_GROUPS.flatMap((g) => g.tabs);
    const CHECKED_TABS: Tab[] = [
      "chat",
      "companion",
      "stream",
      "character",
      "character-select",
      "wallets",
      "knowledge",
      "connectors",
      "plugins",
      "skills",
      "actions",
      "workflows",
      "triggers",
      "advanced",
      "fine-tuning",
      "trajectories",
      "runtime",
      "database",
      "lifo",
      "logs",
      "security",
      "settings",
    ];
    for (const tab of CHECKED_TABS) {
      expect(
        allGroupedTabs,
        `tab "${tab}" must appear in ALL_TAB_GROUPS`,
      ).toContain(tab);
    }
  });
});

describe("getTabGroups", () => {
  it("returns all groups when stream enabled", () => {
    const groups = getTabGroups(true);
    const labels = groups.map((g) => g.label);
    expect(labels).toContain("Stream");
    expect(labels).toContain("Advanced");
  });

  it("excludes Stream group when stream disabled", () => {
    const groups = getTabGroups(false);
    expect(groups.map((g) => g.label)).not.toContain("Stream");
  });

  it("Advanced group always included (workflows lives here)", () => {
    expect(getTabGroups(false).find((g) => g.label === "Advanced")).toBeDefined();
    expect(getTabGroups(true).find((g) => g.label === "Advanced")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// titleForTab
// ---------------------------------------------------------------------------

describe("titleForTab", () => {
  it("workflows → Workflows", () =>
    expect(titleForTab("workflows")).toBe("Workflows"));
  it("chat → Chat", () => expect(titleForTab("chat")).toBe("Chat"));
  it("stream → Stream", () => expect(titleForTab("stream")).toBe("Stream"));
  it("advanced → Advanced", () =>
    expect(titleForTab("advanced")).toBe("Advanced"));
});
