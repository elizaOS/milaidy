import { describe, expect, it } from "vitest";
import { resolvePluginConfigMutationRejections } from "./server";

describe("resolvePluginConfigMutationRejections", () => {
  it("rejects unknown config keys", () => {
    const rejections = resolvePluginConfigMutationRejections(
      [{ key: "OPENAI_API_KEY" }],
      { UNDECLARED_KEY: "x" },
    );
    expect(rejections).toEqual([
      {
        field: "UNDECLARED_KEY",
        message: "UNDECLARED_KEY is not a declared config key for this plugin",
      },
    ]);
  });

  it("rejects blocked env keys even when declared by a plugin", () => {
    const rejections = resolvePluginConfigMutationRejections(
      [{ key: "MILADY_API_TOKEN" }],
      { MILADY_API_TOKEN: "secret" },
    );
    expect(rejections).toEqual([
      {
        field: "MILADY_API_TOKEN",
        message: "MILADY_API_TOKEN is blocked for security reasons",
      },
    ]);
  });

  it("accepts declared and non-blocked config keys", () => {
    const rejections = resolvePluginConfigMutationRejections(
      [{ key: "OPENAI_API_KEY" }, { key: "MODEL_NAME" }],
      { OPENAI_API_KEY: "sk-test", MODEL_NAME: "gpt-4.1-mini" },
    );
    expect(rejections).toEqual([]);
  });
});
