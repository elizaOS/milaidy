import { describe, expect, it } from "vitest";
import { injectApiBaseIntoHtml } from "./server";

describe("injectApiBaseIntoHtml", () => {
  it("injects the external API base before </head>", () => {
    const html = Buffer.from(
      "<html><head><title>Milady</title></head><body /></html>",
    );

    const injected = injectApiBaseIntoHtml(
      html,
      "https://proxy.example.com/proxy/2138",
    ).toString("utf8");

    expect(injected).toContain(
      'window.__ELIZA_API_BASE__="https://proxy.example.com/proxy/2138"',
    );
    expect(injected.indexOf("window.__ELIZA_API_BASE__")).toBeLessThan(
      injected.indexOf("</head>"),
    );
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
