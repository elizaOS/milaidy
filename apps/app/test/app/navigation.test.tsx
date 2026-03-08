import { describe, expect, it } from "vitest";
import {
  ALL_TAB_GROUPS,
  getTabMeta,
  getTabRegistry,
  pathForTab,
  tabFromPath,
  titleForTab,
} from "../../src/navigation";

describe("navigation", () => {
  it("maps security tab to path and title", () => {
    expect(pathForTab("security")).toBe("/security");
    expect(tabFromPath("/security")).toBe("security");
    expect(titleForTab("security")).toBe("Security");
  });

  it("maps lifo tab to path and title", () => {
    expect(pathForTab("lifo")).toBe("/lifo");
    expect(tabFromPath("/lifo")).toBe("lifo");
    expect(titleForTab("lifo")).toBe("Lifo");
  });

  it("includes security in the advanced tab group", () => {
    const advancedGroup = ALL_TAB_GROUPS.find(
      (group) => group.label === "Advanced",
    );
    expect(advancedGroup?.tabs).toContain("security");
    expect(advancedGroup?.tabs).toContain("lifo");
  });

  it("exposes palette metadata and restore keys in the tab registry", () => {
    const chatMeta = getTabMeta("chat");
    expect(chatMeta.paletteLabel).toBe("Open Chat");
    expect(chatMeta.aliases).toContain("conversation");
    expect(chatMeta.restoreKey).toBe("milady:shell-panels:chat");
  });

  it("filters hidden tabs from the default visible registry", () => {
    const visibleTabs = getTabRegistry().map((tab) => tab.id);
    expect(visibleTabs).not.toContain("voice");
    expect(visibleTabs).toContain("logs");
  });
});
