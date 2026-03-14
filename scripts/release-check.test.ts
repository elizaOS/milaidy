import { describe, expect, it } from "vitest";

import {
  findLocalPackHotspots,
  shouldSkipExactPackDryRun,
} from "./release-check";

describe("release-check local pack behavior", () => {
  it("detects configured local pack hotspots", () => {
    const hotspots = findLocalPackHotspots(
      ["dist/node_modules", "apps/app/dist/vrms", "apps/app/dist/animations"],
      (candidate) => candidate !== "apps/app/dist/animations",
    );

    expect(hotspots).toEqual(["dist/node_modules", "apps/app/dist/vrms"]);
  });

  it("skips exact pack dry-run only for local hotspot-heavy runs", () => {
    expect(
      shouldSkipExactPackDryRun(["dist/node_modules"], {
        CI: "",
        GITHUB_ACTIONS: "",
        MILADY_FORCE_PACK_DRY_RUN: "",
      }),
    ).toBe(true);
    expect(
      shouldSkipExactPackDryRun(["dist/node_modules"], {
        CI: "1",
        GITHUB_ACTIONS: "",
        MILADY_FORCE_PACK_DRY_RUN: "",
      }),
    ).toBe(false);
    expect(
      shouldSkipExactPackDryRun(["dist/node_modules"], {
        CI: "",
        GITHUB_ACTIONS: "",
        MILADY_FORCE_PACK_DRY_RUN: "1",
      }),
    ).toBe(false);
    expect(
      shouldSkipExactPackDryRun([], {
        CI: "",
        GITHUB_ACTIONS: "",
        MILADY_FORCE_PACK_DRY_RUN: "",
      }),
    ).toBe(false);
  });
});
