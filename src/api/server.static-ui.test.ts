import http from "node:http";
import { describe, expect, it } from "vitest";
import { injectApiBaseIntoHtml, parseSceneParam } from "./server";

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
      'window.__MILADY_API_BASE__="https://proxy.example.com/proxy/2138"',
    );
    expect(injected.indexOf("window.__MILADY_API_BASE__")).toBeLessThan(
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

// ---------------------------------------------------------------------------
// parseSceneParam — scene query parameter parsing & sanitization
// ---------------------------------------------------------------------------

/** Helper: build a minimal IncomingMessage stub with the given URL. */
function fakeReq(url: string): http.IncomingMessage {
  return { url } as unknown as http.IncomingMessage;
}

describe("parseSceneParam", () => {
  it("returns the scene value for a valid alphanumeric id", () => {
    expect(parseSceneParam(fakeReq("/api/avatar/background?scene=idle"))).toBe(
      "idle",
    );
  });

  it("accepts hyphens in scene ids", () => {
    expect(
      parseSceneParam(fakeReq("/api/avatar/background?scene=main-stage")),
    ).toBe("main-stage");
  });

  it("accepts numeric scene ids", () => {
    expect(
      parseSceneParam(fakeReq("/api/avatar/background?scene=42")),
    ).toBe("42");
  });

  it("returns null when the scene param is absent", () => {
    expect(parseSceneParam(fakeReq("/api/avatar/background"))).toBeNull();
  });

  it("returns null for an empty scene param", () => {
    expect(
      parseSceneParam(fakeReq("/api/avatar/background?scene=")),
    ).toBeNull();
  });

  it("rejects scene ids with uppercase letters", () => {
    expect(
      parseSceneParam(fakeReq("/api/avatar/background?scene=Idle")),
    ).toBeNull();
  });

  it("rejects scene ids containing special characters", () => {
    expect(
      parseSceneParam(fakeReq("/api/avatar/background?scene=../../etc")),
    ).toBeNull();
    expect(
      parseSceneParam(fakeReq("/api/avatar/background?scene=a%20b")),
    ).toBeNull();
    expect(
      parseSceneParam(fakeReq("/api/avatar/background?scene=foo_bar")),
    ).toBeNull();
  });

  it("rejects scene ids with spaces or encoded chars", () => {
    expect(
      parseSceneParam(fakeReq("/api/avatar/background?scene=hello+world")),
    ).toBeNull();
  });

  it("returns null when req.url is undefined", () => {
    expect(parseSceneParam({ url: undefined } as http.IncomingMessage)).toBeNull();
  });
});
