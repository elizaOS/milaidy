import { describe, expect, it } from "vitest";
import {
  TAB_GROUPS,
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

  it("includes security in the advanced tab group", () => {
    const advancedGroup = TAB_GROUPS.find((group) => group.label === "Advanced");
    expect(advancedGroup?.tabs).toContain("security");
  });
});
