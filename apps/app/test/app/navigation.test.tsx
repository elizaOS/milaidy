import { describe, expect, it } from "vitest";
import {
  pathForTab,
  TAB_GROUPS,
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
    const advancedGroup = TAB_GROUPS.find(
      (group) => group.label === "Advanced",
    );
    expect(advancedGroup?.tabs).toContain("security");
    expect(advancedGroup?.tabs).toContain("lifo");
  });
});
