import { describe, expect, it } from "vitest";
import {
  DEFAULT_BROWSER_HOME,
  normalizeBrowserAddressInput,
  readBrowserNavigationUrl,
} from "../../src/browser-surface";

describe("browser surface helpers", () => {
  it("normalizes URL-style address input into http(s) destinations", () => {
    expect(normalizeBrowserAddressInput("example.com/docs")).toBe(
      "https://example.com/docs",
    );
    expect(normalizeBrowserAddressInput("localhost:3000")).toBe(
      "http://localhost:3000/",
    );
    expect(normalizeBrowserAddressInput("https://milady.ai")).toBe(
      "https://milady.ai/",
    );
  });

  it("falls back to search or home for non-url input", () => {
    expect(normalizeBrowserAddressInput("")).toBe(DEFAULT_BROWSER_HOME);
    expect(normalizeBrowserAddressInput("agent orchestration patterns")).toBe(
      "https://duckduckgo.com/?q=agent%20orchestration%20patterns",
    );
    expect(normalizeBrowserAddressInput("javascript:alert(1)")).toBe(
      "https://duckduckgo.com/?q=javascript%3Aalert(1)",
    );
  });

  it("extracts navigation URLs from webview event payloads", () => {
    expect(readBrowserNavigationUrl("https://milady.ai/docs")).toBe(
      "https://milady.ai/docs",
    );
    expect(
      readBrowserNavigationUrl({ url: "https://app.milady.ai/settings" }),
    ).toBe("https://app.milady.ai/settings");
    expect(readBrowserNavigationUrl({ url: "file:///tmp/test" })).toBeNull();
    expect(readBrowserNavigationUrl({})).toBeNull();
  });
});
