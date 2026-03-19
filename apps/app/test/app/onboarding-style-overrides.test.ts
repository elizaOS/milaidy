import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const APP_SRC_DIR = path.resolve(import.meta.dirname, "../../src");
const MAIN_PATH = path.join(APP_SRC_DIR, "main.tsx");
const CSS_PATH = path.join(APP_SRC_DIR, "onboarding-overrides.css");

describe("onboarding style overrides", () => {
  it("imports the local onboarding override stylesheet after app-core styles", () => {
    const source = fs.readFileSync(MAIN_PATH, "utf8");

    expect(source).toContain('import "@elizaos/app-core/styles/styles.css";');
    expect(source).toContain('import "./onboarding-overrides.css";');
  });

  it("normalizes provider card text layout without enlarging the card footprint", () => {
    const css = fs.readFileSync(CSS_PATH, "utf8");

    expect(css).toContain(".onboarding-provider-card {");
    expect(css).toContain("padding: 10px 14px;");
    expect(css).toContain(".onboarding-provider-card > div:last-child {");
    expect(css).toContain("justify-content: center;");
    expect(css).toContain(".onboarding-provider-desc {");
    expect(css).toContain("-webkit-line-clamp: 2;");
    expect(css).toContain("min-height: calc(1.3em * 2);");
    expect(css).not.toContain("min-height: 84px;");
  });
});
