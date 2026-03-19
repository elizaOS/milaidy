// @elizaos/plugin-signal does not export the "./actions" subpath.
// All tests are skipped until the subpath export is added upstream.
import { describe, it } from "vitest";

describe.skip("sendSignalMessage (skipped: @elizaos/plugin-signal/actions subpath not exported)", () => {
  it("placeholder", () => {});
});
