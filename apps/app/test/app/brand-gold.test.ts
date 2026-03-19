import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const APP_SRC_DIR = path.resolve(import.meta.dirname, "../../src");
const MAIN_PATH = path.join(APP_SRC_DIR, "main.tsx");
const BRAND_CSS_PATH = path.join(APP_SRC_DIR, "brand-gold.css");
const CHARACTER_EDITOR_CSS_PATH = path.join(
  APP_SRC_DIR,
  "components/CharacterEditor.css",
);
const CHARACTER_ROSTER_PATH = path.join(
  APP_SRC_DIR,
  "components/CharacterRoster.tsx",
);
const MAIN_WINDOW_RUNTIME_PATH = path.join(
  APP_SRC_DIR,
  "DesktopSurfaceNavigationRuntime.tsx",
);

describe("brand gold theme overrides", () => {
  it("loads the local gold brand stylesheet after app-core styles", () => {
    const source = fs.readFileSync(MAIN_PATH, "utf8");

    expect(source).toContain('import "@elizaos/app-core/styles/styles.css";');
    expect(source).toContain('import "./brand-gold.css";');
    expect(source).toContain("DesktopSurfaceNavigationRuntime");
  });

  it("overrides app-core accent tokens with the richer gold palette", () => {
    const css = fs.readFileSync(BRAND_CSS_PATH, "utf8");

    expect(css).toContain("--jet-black: #0b0b0c;");
    expect(css).toContain("--deep-gold: #a67c2e;");
    expect(css).toContain("--classic-gold: #cfaf5a;");
    expect(css).toContain("--highlight-gold: #f2d27a;");
    expect(css).toContain("--accent: var(--classic-gold);");
    expect(css).toContain(".onboarding-screen {");
    expect(css).toContain(".onboarding-step-item--active .onboarding-step-dot");
    expect(css).toContain(
      '[data-testid="companion-header-chat-controls"] > button {',
    );
    expect(css).toContain(".settings-content-area {");
    expect(css).toContain("--s-accent: var(--classic-gold);");
    expect(css).toContain(".plugins-game-card {");
    expect(css).toContain(".plugins-game-card.is-selected {");
    expect(css).toContain(
      'div[class*="flex"][class*="gap-1"][class*="border-b"][class*="border-[var(--border)]"][class*="mb-5"] {',
    );
    expect(css).toContain(
      'div[class*="overflow-auto"][class*="border-border/40"][class*="bg-card/40"][class*="backdrop-blur-md"][class*="rounded-2xl"][class*="shadow-inner"] {',
    );
    expect(css).toContain(
      '[data-testid="companion-header-chat-controls"] > button:hover,',
    );
  });

  it("removes the app-local hardcoded yellow accents from the roster and editor", () => {
    const editorCss = fs.readFileSync(CHARACTER_EDITOR_CSS_PATH, "utf8");
    const rosterSource = fs.readFileSync(CHARACTER_ROSTER_PATH, "utf8");

    expect(editorCss).toContain("--ce-gold: var(--classic-gold, #cfaf5a);");
    expect(editorCss).toContain(".ce-right-toggle {");
    expect(editorCss).toContain(
      "background: linear-gradient(\n    180deg,\n    rgba(18, 18, 20, 0.96) 0%,\n    rgba(11, 11, 12, 0.92) 100%\n  );",
    );
    expect(editorCss).toContain(
      ".ce-right-toggle-btn {\n  padding: 0.375rem 1rem;\n  border-radius: 0.375rem;\n  border: 1px solid transparent;\n  background: rgba(30, 31, 35, 0.9);",
    );
    expect(editorCss).toContain(".ce-page-tab--active {");
    expect(editorCss).toContain(
      "linear-gradient(\n    135deg,\n    var(--ce-gold-shadow) 0%,\n    var(--ce-gold) 58%,\n    var(--ce-gold-highlight) 100%\n  )",
    );
    expect(editorCss).not.toContain("#facc15");
    expect(editorCss).not.toContain("#fbbf24");
    expect(rosterSource).toContain('className="ce-roster-card-glow"');
    expect(rosterSource).not.toContain("bg-yellow-300/15");
  });

  it("adds a renderer-side show-main navigation runtime for detached surface menus", () => {
    const source = fs.readFileSync(MAIN_WINDOW_RUNTIME_PATH, "utf8");

    expect(source).toContain('itemId.startsWith("show-main:")');
    expect(source).toContain('switchShellView("desktop")');
    expect(source).toContain("setTab(target)");
  });
});
