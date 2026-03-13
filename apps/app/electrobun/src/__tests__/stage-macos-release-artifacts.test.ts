import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const STAGE_MACOS_RELEASE_ARTIFACTS_PATH = path.resolve(
  import.meta.dirname,
  "../../scripts/stage-macos-release-artifacts.sh",
);

describe("stage-macos-release-artifacts.sh", () => {
  it("rebuilds the direct launcher using the packaged launcher architecture", () => {
    const script = fs.readFileSync(STAGE_MACOS_RELEASE_ARTIFACTS_PATH, "utf8");

    expect(script).toContain(
      'LAUNCHER_ARCHES="$(lipo -archs "$LAUNCHER_PATH" 2>/dev/null || true)"',
    );
    expect(script).toContain("clang_arch_args=()");
    expect(script).toContain('clang_arch_args+=(-arch "$arch")');
    expect(script).toContain(
      'echo "stage-macos-release-artifacts: unsupported launcher architecture: $arch"',
    );
    expect(script).toContain('"${clang_arch_args[@]}"');
  });
});
