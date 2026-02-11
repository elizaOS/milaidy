import { describe, expect, test } from "vitest";
import { TAB_GROUPS, pathForTab, tabFromPath, titleForTab } from "../../src/navigation";

describe("triggers navigation", () => {
  test("resolves path and title for triggers tab", () => {
    expect(pathForTab("triggers")).toBe("/triggers");
    expect(tabFromPath("/triggers")).toBe("triggers");
    expect(titleForTab("triggers")).toBe("Triggers");
  });

  test("includes triggers in Manage group", () => {
    const manage = TAB_GROUPS.find((group) => group.label === "Manage");
    expect(manage).toBeDefined();
    expect(manage?.tabs.includes("triggers")).toBe(true);
  });

  test("resolves path and title for fine-tuning tab", () => {
    expect(pathForTab("fine_tuning")).toBe("/fine-tuning");
    expect(tabFromPath("/fine-tuning")).toBe("fine_tuning");
    expect(titleForTab("fine_tuning")).toBe("Fine-Tuning");
  });

  test("includes fine-tuning in Manage group", () => {
    const manage = TAB_GROUPS.find((group) => group.label === "Manage");
    expect(manage).toBeDefined();
    expect(manage?.tabs.includes("fine_tuning")).toBe(true);
  });
});
