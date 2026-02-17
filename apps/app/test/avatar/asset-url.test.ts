import { describe, expect, it } from "vitest";
import { resolveAppAssetUrl } from "../../src/asset-url";

describe("resolveAppAssetUrl", () => {
  it("returns root-relative path when runtime URL context is unavailable", () => {
    expect(resolveAppAssetUrl("vrms/1.vrm")).toBe("/vrms/1.vrm");
    expect(resolveAppAssetUrl("/vrms/previews/milady-1.png")).toBe(
      "/vrms/previews/milady-1.png",
    );
  });

  it("passes through already-absolute URLs", () => {
    expect(resolveAppAssetUrl("blob:http://localhost/abc")).toBe(
      "blob:http://localhost/abc",
    );
    expect(resolveAppAssetUrl("data:text/plain,ok")).toBe("data:text/plain,ok");
    expect(resolveAppAssetUrl("https://cdn.example.com/a.vrm")).toBe(
      "https://cdn.example.com/a.vrm",
    );
  });

  it("resolves file:// assets relative to index directory", () => {
    const url = resolveAppAssetUrl("/vrms/1.vrm", {
      currentUrl:
        "file:///Users/tester/Milady.app/Contents/Resources/app/dist/index.html",
      baseUrl: "./",
    });
    expect(url).toBe(
      "file:///Users/tester/Milady.app/Contents/Resources/app/dist/vrms/1.vrm",
    );
  });

  it("resolves custom-scheme assets using base path", () => {
    const url = resolveAppAssetUrl("animations/idle.glb", {
      currentUrl: "capacitor-electron://-/chat",
      baseUrl: "./",
    });
    expect(url).toBe("capacitor-electron://-/animations/idle.glb");
  });
});
