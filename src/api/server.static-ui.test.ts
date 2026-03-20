import { describe, expect, it } from "vitest";
import { injectApiBaseIntoHtml } from "./server";

describe("injectApiBaseIntoHtml", () => {
  it("injects the external API base before </head>", () => {
    const html = Buffer.from(
      "<html><head><title>Eliza</title></head><body /></html>",
    );

    const injected = injectApiBaseIntoHtml(
      html,
      "https://proxy.example.com/proxy/2138",
    ).toString("utf8");

    const hasElizaKey = injected.includes(
      'window.__ELIZA_API_BASE__="https://proxy.example.com/proxy/2138"',
    );
    const hasMiladyKey = injected.includes(
      'window.__MILADY_API_BASE__="https://proxy.example.com/proxy/2138"',
    );

    expect(hasElizaKey || hasMiladyKey).toBe(true);

    const keyIndex = injected.indexOf(
      hasElizaKey ? "window.__ELIZA_API_BASE__" : "window.__MILADY_API_BASE__",
    );
    expect(keyIndex).toBeLessThan(injected.indexOf("</head>"));
  });

  it("leaves HTML unchanged when </head> is missing", () => {
    const html = Buffer.from("<html><body>No head tag</body></html>");

    const injected = injectApiBaseIntoHtml(
      html,
      "https://proxy.example.com/proxy/2138",
    );

    expect(injected.equals(html)).toBe(true);
  });
});
