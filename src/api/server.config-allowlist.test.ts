import { describe, expect, it } from "vitest";
import { CONFIG_WRITE_ALLOWED_TOP_KEYS } from "./server";

describe("CONFIG_WRITE_ALLOWED_TOP_KEYS", () => {
  it("includes connectors so /api/config can persist connector settings", () => {
    expect(CONFIG_WRITE_ALLOWED_TOP_KEYS.has("connectors")).toBe(true);
  });

  it("keeps legacy channels support for backward compatibility", () => {
    expect(CONFIG_WRITE_ALLOWED_TOP_KEYS.has("channels")).toBe(true);
  });

  it("does not allow unknown top-level keys", () => {
    expect(CONFIG_WRITE_ALLOWED_TOP_KEYS.has("__proto__")).toBe(false);
    expect(CONFIG_WRITE_ALLOWED_TOP_KEYS.has("notARealTopLevelKey")).toBe(
      false,
    );
  });
});
