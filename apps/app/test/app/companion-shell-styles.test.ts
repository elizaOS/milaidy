import { describe, expect, it } from "vitest";

import {
  cardBackground,
  overlayBackdropClass,
  tabFlags,
  viewWrapperStyle,
} from "../../src/components/companion-shell-styles";

describe("companion shell styles", () => {
  it("uses stronger backdrop dimming for companion overlays", () => {
    expect(overlayBackdropClass(tabFlags("skills"))).toBe(
      "opacity-100 backdrop-blur-2xl bg-black/60 pointer-events-auto",
    );
    expect(overlayBackdropClass(tabFlags("plugins"))).toBe(
      "opacity-100 backdrop-blur-xl bg-black/55 pointer-events-auto",
    );
    expect(overlayBackdropClass(tabFlags("wallets"))).toBe(
      "opacity-100 backdrop-blur-2xl bg-black/65 pointer-events-auto",
    );
  });

  it("uses denser card surfaces for companion popups", () => {
    expect(cardBackground(tabFlags("skills"))).toBe("rgba(16, 20, 30, 0.95)");
    expect(cardBackground(tabFlags("settings"))).toBe("rgba(12, 16, 26, 0.97)");
    expect(cardBackground(tabFlags("character"))).toBe(
      "linear-gradient(to left, rgba(5, 7, 12, 0.98) 42%, rgba(5, 7, 12, 0.9) 78%, rgba(5, 7, 12, 0.72) 100%)",
    );
  });

  it("exposes denser shared modal tokens for companion in-modal views", () => {
    const modalVars = viewWrapperStyle(
      tabFlags("settings"),
      "#f0b232",
    ) as Record<string, string>;

    expect(modalVars["--card"]).toBe("rgba(12, 16, 26, 0.88)");
    expect(modalVars["--surface"]).toBe("rgba(15, 20, 32, 0.94)");
    expect(modalVars["--bg-muted"]).toBe("rgba(18, 24, 36, 0.78)");
    expect(modalVars["--border"]).toBe("rgba(255, 255, 255, 0.12)");
  });
});
