import { describe, expect, it } from "vitest";
import {
  buildLanguageInstruction,
  injectLanguageContext,
  resolveUiLanguageFromRequest,
} from "./server.js";

describe("chat language helpers", () => {
  it("resolves UI language from request header first", () => {
    const language = resolveUiLanguageFromRequest(
      { headers: { "x-milady-ui-language": "zh-CN" } },
      { config: {} },
    );
    expect(language).toBe("zh-CN");
  });

  it("falls back to config UI language when header is missing", () => {
    const language = resolveUiLanguageFromRequest(
      { headers: {} },
      { config: { ui: { language: "zh-CN" } } },
    );
    expect(language).toBe("zh-CN");
  });

  it("defaults to english when language input is invalid", () => {
    const language = resolveUiLanguageFromRequest(
      { headers: { "x-milady-ui-language": "klingon" } },
      { config: {} },
    );
    expect(language).toBe("en");
  });

  it("follows user input language when it clearly differs from UI language", () => {
    const instruction = buildLanguageInstruction("zh-CN", "Please answer in English");
    expect(instruction).toContain("Reply in English");
  });

  it("injects language policy ahead of prompt text", () => {
    const injected = injectLanguageContext("你好，今天怎么样？", "en");
    expect(injected).toContain("[Response Language Policy]");
    expect(injected).toContain("你好，今天怎么样？");
  });
});

