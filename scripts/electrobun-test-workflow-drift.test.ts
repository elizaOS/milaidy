import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const WORKFLOW_PATH = path.join(ROOT, ".github/workflows/test.yml");

describe("Electrobun test workflow drift", () => {
  // Desktop build/packaging validation (preload bridge, diagnostics, DMG
  // smoke test) was moved to release-electrobun.yml. The old desktop-ui-e2e
  // and desktop-packaged-dmg-e2e jobs were removed from test.yml.

  it("does not rerun postinstall in jobs that already use plain bun install", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain(
      "name: Install dependencies\n        run: bun install",
    );
    expect(workflow).not.toContain(
      "name: Install dependencies\n        run: bun install\n        env:\n          npm_config_python: $" +
        "{{ env.pythonLocation }}/bin/python3\n\n      - name: Run repository postinstall patches",
    );
    expect(workflow).not.toContain(
      "name: Install dependencies\n        run: bun install\n\n      - name: Run repository postinstall patches",
    );
  });

  it("skips avatar clone and vision deps in pure test jobs", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain(
      'name: Run repository postinstall patches\n        run: bun run postinstall\n        env:\n          SKIP_AVATAR_CLONE: "1"\n          MILADY_NO_VISION_DEPS: "1"',
    );
  });
});
