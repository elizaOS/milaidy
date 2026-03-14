import { describe, expect, it } from "vitest";

import { buildVisionDepsFailureMessage } from "./lib/dev-ui-vision.mjs";

describe("buildVisionDepsFailureMessage", () => {
  it("makes degraded camera and vision startup explicit", () => {
    const message = buildVisionDepsFailureMessage(
      new Error("command failed"),
      "node scripts/ensure-vision-deps.mjs",
    );

    expect(message).toContain("Vision dependency auto-install failed");
    expect(message).toContain(
      "Camera and vision features will be unavailable in this session",
    );
    expect(message).toContain("node scripts/ensure-vision-deps.mjs");
    expect(message).toContain("command failed");
  });
});
