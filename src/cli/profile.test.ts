import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile";

describe("parseCliProfileArgs", () => {
  it("leaves plugins --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "eliza",
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
      "eliza",
      "plugins",
      "--dev",
      "--allow-unconfigured",
    ]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "eliza", "--dev", "plugins"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "eliza", "plugins"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs([
      "node",
      "eliza",
      "--profile",
      "work",
      "start",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "eliza", "start"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "eliza", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (dev first)", () => {
    const res = parseCliProfileArgs([
      "node",
      "eliza",
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
      "eliza",
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
    const expectedStateDir = path.join("/home/peter", ".eliza-dev");
    expect(env.ELIZA_PROFILE).toBe("dev");
    expect(env.ELIZA_STATE_DIR).toBe(expectedStateDir);
    expect(env.ELIZA_CONFIG_PATH).toBe(
      path.join(expectedStateDir, "eliza.json"),
    );
    expect(env.ELIZA_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      ELIZA_STATE_DIR: "/custom",
      ELIZA_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.ELIZA_STATE_DIR).toBe("/custom");
    expect(env.ELIZA_GATEWAY_PORT).toBe("19099");
    expect(env.ELIZA_CONFIG_PATH).toBe(path.join("/custom", "eliza.json"));
  });
});

describe("formatCliCommand", () => {
  it("returns command unchanged when no profile is set", () => {
    expect(formatCliCommand("eliza setup --fix", {})).toMatch(
      /^(?:eliza|milady) setup --fix$/,
    );
  });

  it("returns command unchanged when profile is default", () => {
    expect(
      formatCliCommand("eliza setup --fix", { ELIZA_PROFILE: "default" }),
    ).toMatch(/^(?:eliza|milady) setup --fix$/);
  });

  it("returns command unchanged when profile is Default (case-insensitive)", () => {
    expect(
      formatCliCommand("eliza setup --fix", { ELIZA_PROFILE: "Default" }),
    ).toMatch(/^(?:eliza|milady) setup --fix$/);
  });

  it("returns command unchanged when profile is invalid", () => {
    expect(
      formatCliCommand("eliza setup --fix", {
        ELIZA_PROFILE: "bad profile",
      }),
    ).toMatch(/^(?:eliza|milady) setup --fix$/);
  });

  it("returns command unchanged when --profile is already present", () => {
    expect(
      formatCliCommand("eliza --profile work setup --fix", {
        ELIZA_PROFILE: "work",
      }),
    ).toMatch(/^(?:eliza|milady) --profile work setup --fix$/);
  });

  it("returns command unchanged when --dev is already present", () => {
    expect(
      formatCliCommand("eliza --dev setup", { ELIZA_PROFILE: "dev" }),
    ).toMatch(/^(?:eliza|milady) --dev setup$/);
  });

  it("inserts --profile flag when profile is set", () => {
    expect(
      formatCliCommand("eliza setup --fix", { ELIZA_PROFILE: "work" }),
    ).toMatch(/^(?:eliza|milady) --profile work setup --fix$/);
  });

  it("trims whitespace from profile", () => {
    expect(
      formatCliCommand("eliza setup --fix", {
        ELIZA_PROFILE: "  jbeliza  ",
      }),
    ).toMatch(/^(?:eliza|milady) --profile jbeliza setup --fix$/);
  });

  it("handles command with no args after eliza", () => {
    expect(formatCliCommand("eliza", { ELIZA_PROFILE: "test" })).toMatch(
      /^(?:eliza|milady) --profile test$/,
    );
  });

  it("handles bun wrapper", () => {
    expect(
      formatCliCommand("bun eliza setup", { ELIZA_PROFILE: "work" }),
    ).toMatch(/^bun (?:eliza|milady) --profile work setup$/);
  });
});
