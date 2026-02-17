import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile";

describe("parseCliProfileArgs", () => {
  it("leaves plugins --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "milady",
      "plugins",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual([
      "node",
      "milady",
      "plugins",
      "--dev",
      "--allow-unconfigured",
    ]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "milady", "--dev", "plugins"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "milady", "plugins"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs([
      "node",
      "milady",
      "--profile",
      "work",
      "start",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "milady", "start"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "milady", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (dev first)", () => {
    const res = parseCliProfileArgs([
      "node",
      "milady",
      "--dev",
      "--profile",
      "work",
      "start",
    ]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (profile first)", () => {
    const res = parseCliProfileArgs([
      "node",
      "milady",
      "--profile",
      "work",
      "--dev",
      "start",
    ]);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join("/home/peter", ".milady-dev");
    expect(env.MILADY_PROFILE).toBe("dev");
    expect(env.MILADY_STATE_DIR).toBe(expectedStateDir);
    expect(env.MILADY_CONFIG_PATH).toBe(
      path.join(expectedStateDir, "milady.json"),
    );
    expect(env.MILADY_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      MILADY_STATE_DIR: "/custom",
      MILADY_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.MILADY_STATE_DIR).toBe("/custom");
    expect(env.MILADY_GATEWAY_PORT).toBe("19099");
    expect(env.MILADY_CONFIG_PATH).toBe(path.join("/custom", "milady.json"));
  });
});

describe("formatCliCommand", () => {
  it("returns command unchanged when no profile is set", () => {
    expect(formatCliCommand("milady setup --fix", {})).toBe(
      "milady setup --fix",
    );
  });

  it("returns command unchanged when profile is default", () => {
    expect(
      formatCliCommand("milady setup --fix", { MILADY_PROFILE: "default" }),
    ).toBe("milady setup --fix");
  });

  it("returns command unchanged when profile is Default (case-insensitive)", () => {
    expect(
      formatCliCommand("milady setup --fix", { MILADY_PROFILE: "Default" }),
    ).toBe("milady setup --fix");
  });

  it("returns command unchanged when profile is invalid", () => {
    expect(
      formatCliCommand("milady setup --fix", {
        MILADY_PROFILE: "bad profile",
      }),
    ).toBe("milady setup --fix");
  });

  it("returns command unchanged when --profile is already present", () => {
    expect(
      formatCliCommand("milady --profile work setup --fix", {
        MILADY_PROFILE: "work",
      }),
    ).toBe("milady --profile work setup --fix");
  });

  it("returns command unchanged when --dev is already present", () => {
    expect(
      formatCliCommand("milady --dev setup", { MILADY_PROFILE: "dev" }),
    ).toBe("milady --dev setup");
  });

  it("inserts --profile flag when profile is set", () => {
    expect(
      formatCliCommand("milady setup --fix", { MILADY_PROFILE: "work" }),
    ).toBe("milady --profile work setup --fix");
  });

  it("trims whitespace from profile", () => {
    expect(
      formatCliCommand("milady setup --fix", {
        MILADY_PROFILE: "  jbmilady  ",
      }),
    ).toBe("milady --profile jbmilady setup --fix");
  });

  it("handles command with no args after milady", () => {
    expect(formatCliCommand("milady", { MILADY_PROFILE: "test" })).toBe(
      "milady --profile test",
    );
  });

  it("handles bun wrapper", () => {
    expect(
      formatCliCommand("bun milady setup", { MILADY_PROFILE: "work" }),
    ).toBe("bun milady --profile work setup");
  });
});
