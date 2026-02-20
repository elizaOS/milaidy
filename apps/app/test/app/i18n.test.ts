import { describe, expect, it } from "vitest";
import {
  createTranslator,
  normalizeLanguage,
  t,
} from "../../src/i18n";

describe("i18n helpers", () => {
  it("normalizes supported language tags", () => {
    expect(normalizeLanguage("en")).toBe("en");
    expect(normalizeLanguage("zh-CN")).toBe("zh-CN");
    expect(normalizeLanguage("zh")).toBe("zh-CN");
    expect(normalizeLanguage("zh-Hans-CN")).toBe("zh-CN");
    expect(normalizeLanguage("en-US")).toBe("en");
  });

  it("falls back to english for unknown language input", () => {
    expect(normalizeLanguage("xx")).toBe("en");
    expect(normalizeLanguage(undefined)).toBe("en");
  });

  it("falls back to english message when key is missing in selected locale", () => {
    expect(t("zh-CN", "nav.chat")).toBe("聊天");
    expect(t("zh-CN", "nonexistent.key")).toBe("nonexistent.key");
  });

  it("interpolates template variables", () => {
    expect(t("en", "pairing.expiresIn", { seconds: 12 })).toContain("12");
    expect(t("zh-CN", "conversations.minutesAgo", { count: 8 })).toContain("8");
  });

  it("creates stable translator for a target language", () => {
    const zh = createTranslator("zh-CN");
    expect(zh("nav.wallets")).toBe("钱包");
  });
});

