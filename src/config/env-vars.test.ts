import { describe, expect, it } from "vitest";
import { collectConfigEnvVars } from "./env-vars";
import type { MiladyConfig } from "./types";

/** Helper to build a partial config with only the env property. */
function cfg(env: MiladyConfig["env"]): MiladyConfig {
  return { env } as MiladyConfig;
}

describe("collectConfigEnvVars", () => {
  it("returns empty object when cfg is undefined", () => {
    expect(collectConfigEnvVars(undefined)).toEqual({});
  });

  it("returns empty object when cfg.env is undefined", () => {
    expect(collectConfigEnvVars(cfg(undefined))).toEqual({});
  });

  it("collects vars sub-object entries", () => {
    const result = collectConfigEnvVars(
      cfg({ vars: { FOO: "bar", BAZ: "qux" } }),
    );
    expect(result).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("skips falsy values in vars", () => {
    const result = collectConfigEnvVars(
      cfg({
        vars: {
          KEEP: "hello",
          EMPTY: "",
        },
      }),
    );
    expect(result).toEqual({ KEEP: "hello" });
  });

  it("collects top-level string env entries", () => {
    const result = collectConfigEnvVars(
      cfg({ MY_VAR: "my-value", ANOTHER: "yes" }),
    );
    expect(result).toEqual({ MY_VAR: "my-value", ANOTHER: "yes" });
  });

  it("skips shellEnv and vars keys from top-level iteration", () => {
    const result = collectConfigEnvVars(
      cfg({
        shellEnv: "should-be-skipped",
        vars: { INNER: "from-vars" },
        REAL: "kept",
      }),
    );
    expect(result).toEqual({ INNER: "from-vars", REAL: "kept" });
  });

  it("returns only the string values from top-level", () => {
    const result = collectConfigEnvVars(
      cfg({
        VALID: "kept",
        ALSO_VALID: "also-kept",
      }),
    );
    expect(result).toEqual({ VALID: "kept", ALSO_VALID: "also-kept" });
  });

  it("skips empty and whitespace-only strings from top-level", () => {
    const result = collectConfigEnvVars(
      cfg({
        EMPTY: "",
        SPACES: "   ",
        TABS: "\t",
        VALID: "kept",
      }),
    );
    expect(result).toEqual({ VALID: "kept" });
  });

  it("top-level entries override vars entries for the same key", () => {
    const result = collectConfigEnvVars(
      cfg({
        vars: { SHARED: "from-vars" },
        SHARED: "from-top-level",
      }),
    );
    expect(result).toEqual({ SHARED: "from-top-level" });
  });

  it("correctly merges vars and top-level entries", () => {
    const result = collectConfigEnvVars(
      cfg({
        vars: {
          FROM_VARS: "vars-value",
          OVERRIDE_ME: "original",
        },
        FROM_TOP: "top-value",
        OVERRIDE_ME: "overridden",
        shellEnv: "ignored",
      }),
    );
    expect(result).toEqual({
      FROM_VARS: "vars-value",
      FROM_TOP: "top-value",
      OVERRIDE_ME: "overridden",
    });
  });
});
