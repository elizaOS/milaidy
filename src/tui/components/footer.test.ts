import { visibleWidth } from "@mariozechner/pi-tui";
import { describe, expect, it } from "vitest";
import { FooterComponent } from "./footer.js";

describe("FooterComponent", () => {
  it("truncates hints to fit available width", () => {
    const footer = new FooterComponent();

    const lines = footer.render(18);
    expect(lines).toHaveLength(1);
    expect(visibleWidth(lines[0] ?? "")).toBeLessThanOrEqual(18);
  });

  it("still renders a truncated hint on tiny terminals", () => {
    const footer = new FooterComponent();

    const lines = footer.render(5);
    expect(lines).toHaveLength(1);
    expect((lines[0] ?? "").length).toBeGreaterThan(0);
    expect(visibleWidth(lines[0] ?? "")).toBeLessThanOrEqual(5);
  });
});
