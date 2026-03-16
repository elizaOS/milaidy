import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const STAGE_MACOS_RELEASE_ARTIFACTS_PATH = path.resolve(
  import.meta.dirname,
  "../../scripts/stage-macos-release-artifacts.sh",
);

describe("stage-macos-release-artifacts.sh", () => {
  it("stages the signed app without rebuilding or re-signing it", () => {
    const script = fs.readFileSync(STAGE_MACOS_RELEASE_ARTIFACTS_PATH, "utf8");

    expect(script).toContain('ditto "$APP_BUNDLE_PATH" "$STAGED_APP_PATH"');
    expect(script).toContain(
      'codesign --verify --deep --strict --verbose=2 "$STAGED_APP_PATH"',
    );
    expect(script).not.toContain(
      'DIRECT_LAUNCHER_SOURCE="$SCRIPT_DIR/macos-direct-launcher.c"',
    );
    expect(script).not.toContain(
      'codesign -d --entitlements :- "$STAGED_APP_PATH"',
    );
    expect(script).not.toContain("/usr/bin/clang \\");
    expect(script).not.toContain(
      'install -m 0755 "$TMP_LAUNCHER_PATH" "$LAUNCHER_PATH"',
    );
    expect(script).toContain(
      'codesign --force --timestamp --sign "$ELECTROBUN_DEVELOPER_ID" "$TEMP_DMG_PATH"',
    );
  });
});
