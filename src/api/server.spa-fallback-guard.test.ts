import { describe, expect, it } from "vitest";
import { shouldServeSpaFallback } from "./spa-fallback-guard";

describe("shouldServeSpaFallback", () => {
  it("allows extensionless navigation paths", () => {
    expect(shouldServeSpaFallback("/dashboard")).toBe(true);
    expect(shouldServeSpaFallback("/settings/general")).toBe(true);
    expect(shouldServeSpaFallback("/some-unknown-route")).toBe(true);
    expect(shouldServeSpaFallback("/")).toBe(true);
  });

  it("allows .html paths", () => {
    expect(shouldServeSpaFallback("/index.html")).toBe(true);
    expect(shouldServeSpaFallback("/page.html")).toBe(true);
  });

  it("rejects .vrm asset requests", () => {
    expect(shouldServeSpaFallback("/milady-1.vrm")).toBe(false);
    expect(shouldServeSpaFallback("/vrms/milady-1.vrm")).toBe(false);
  });

  it("rejects .glb asset requests", () => {
    expect(shouldServeSpaFallback("/idle.glb")).toBe(false);
    expect(shouldServeSpaFallback("/animations/emotes/dance.glb")).toBe(false);
  });

  it("rejects other binary/static asset extensions", () => {
    expect(shouldServeSpaFallback("/script.js")).toBe(false);
    expect(shouldServeSpaFallback("/style.css")).toBe(false);
    expect(shouldServeSpaFallback("/image.png")).toBe(false);
    expect(shouldServeSpaFallback("/photo.jpg")).toBe(false);
    expect(shouldServeSpaFallback("/font.woff2")).toBe(false);
    expect(shouldServeSpaFallback("/data.json")).toBe(false);
    expect(shouldServeSpaFallback("/model.fbx")).toBe(false);
  });

  it("is case-insensitive for extensions", () => {
    expect(shouldServeSpaFallback("/model.VRM")).toBe(false);
    expect(shouldServeSpaFallback("/page.HTML")).toBe(true);
    expect(shouldServeSpaFallback("/anim.GLB")).toBe(false);
  });
});
