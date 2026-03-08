import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SMOKE_TEST_PATH = path.resolve(
  import.meta.dirname,
  "../../scripts/smoke-test.sh",
);

describe("smoke-test.sh", () => {
  it("waits for packaged app handoff after the launcher exits", () => {
    const script = fs.readFileSync(SMOKE_TEST_PATH, "utf8");

    expect(script).toContain(
      'PACKAGED_HANDOFF_GRACE_SECONDS="$' +
        '{PACKAGED_HANDOFF_GRACE_SECONDS:-15}"',
    );
    expect(script).toContain(
      "Launcher exited; waiting for packaged app handoff...",
    );
    expect(script).toContain(
      "Launcher handoff detected; following packaged app process",
    );
    expect(script).toContain("launcher exited before packaged app handoff");
    expect(script).toContain('if [[ "$f" == *"/.dmg-staging/"* ]]; then');
  });
});
