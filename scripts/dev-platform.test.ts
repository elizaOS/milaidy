import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SCRIPT_PATH = path.resolve(import.meta.dirname, "dev-platform.mjs");

describe("dev-platform.mjs", () => {
  it("points Electrobun at the sibling desktop dev API when it launches one", () => {
    const script = fs.readFileSync(SCRIPT_PATH, "utf8");

    expect(script).toContain(
      "const apiPort = String(process.env.MILADY_API_PORT || 31337);",
    );
    expect(script).toContain(
      "MILADY_DESKTOP_API_BASE: `http://127.0.0.1:$" + "{apiPort}`",
    );
    expect(script).toContain("MILADY_API_PORT: apiPort");
  });

  it("only injects the external desktop API base when the helper API is enabled", () => {
    const script = fs.readFileSync(SCRIPT_PATH, "utf8");

    expect(script).toContain("...(skipApi");
    expect(script).toContain("? {}");
  });
});
