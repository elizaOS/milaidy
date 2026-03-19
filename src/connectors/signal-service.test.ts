// @elizaos/plugin-signal does not export the "./service" subpath.
// All tests are skipped until the subpath export is added upstream.
import { describe, it } from "vitest";

describe.skip("signalPlugin (skipped: @elizaos/plugin-signal/service subpath not exported)", () => {
  it("placeholder", () => {});
});

describe.skip("SignalNativeService (skipped: @elizaos/plugin-signal/service subpath not exported)", () => {
  it("placeholder", () => {});
});
