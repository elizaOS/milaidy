import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validatePluginPath } from "../plugins-cli";

describe("S5: validatePluginPath", () => {
  it("accepts paths under home directory", () => {
    const homePath = path.join(os.homedir(), "projects", "my-plugin");
    expect(() => validatePluginPath(homePath)).not.toThrow();
  });

  it("accepts paths under cwd", () => {
    const cwdPath = path.join(process.cwd(), "plugins", "local");
    expect(() => validatePluginPath(cwdPath)).not.toThrow();
  });

  it("accepts home directory itself", () => {
    expect(() => validatePluginPath(os.homedir())).not.toThrow();
  });

  it("accepts cwd itself", () => {
    expect(() => validatePluginPath(process.cwd())).not.toThrow();
  });

  it("rejects paths outside home and cwd", () => {
    expect(() => validatePluginPath("/etc/passwd")).toThrow(
      "outside allowed boundaries",
    );
    expect(() => validatePluginPath("/tmp/evil-plugin")).toThrow(
      "outside allowed boundaries",
    );
  });

  it("rejects relative paths", () => {
    expect(() => validatePluginPath("../evil")).toThrow(
      "outside allowed boundaries",
    );
    expect(() => validatePluginPath("relative/path")).toThrow(
      "outside allowed boundaries",
    );
  });
});
