import { describe, expect, it } from "vitest";
import {
  ALL_SCENE_IDS,
  BROADCAST_SCENE_IDS,
  isBroadcastScene,
} from "./types";
import type { BackgroundConfig, SceneLayout } from "./types";

describe("Scene ID constants", () => {
  it("ALL_SCENE_IDS has 7 entries", () => {
    expect(ALL_SCENE_IDS).toHaveLength(7);
  });

  it("BROADCAST_SCENE_IDS has 3 entries", () => {
    expect(BROADCAST_SCENE_IDS).toHaveLength(3);
  });

  it("BROADCAST_SCENE_IDS is a subset of ALL_SCENE_IDS", () => {
    for (const id of BROADCAST_SCENE_IDS) {
      expect(ALL_SCENE_IDS).toContain(id);
    }
  });

  it("contains expected scene IDs", () => {
    expect(ALL_SCENE_IDS).toContain("idle");
    expect(ALL_SCENE_IDS).toContain("terminal");
    expect(ALL_SCENE_IDS).toContain("chatting");
    expect(ALL_SCENE_IDS).toContain("gaming");
    expect(ALL_SCENE_IDS).toContain("starting-soon");
    expect(ALL_SCENE_IDS).toContain("be-right-back");
    expect(ALL_SCENE_IDS).toContain("ending");
  });
});

describe("isBroadcastScene()", () => {
  it("returns true for broadcast scenes", () => {
    expect(isBroadcastScene("starting-soon")).toBe(true);
    expect(isBroadcastScene("be-right-back")).toBe(true);
    expect(isBroadcastScene("ending")).toBe(true);
  });

  it("returns false for content scenes", () => {
    expect(isBroadcastScene("idle")).toBe(false);
    expect(isBroadcastScene("terminal")).toBe(false);
    expect(isBroadcastScene("chatting")).toBe(false);
    expect(isBroadcastScene("gaming")).toBe(false);
  });
});

describe("BackgroundConfig type", () => {
  it("SceneLayout accepts background field", () => {
    const layout: SceneLayout = {
      sceneId: "idle",
      layout: { version: 1, name: "Test", widgets: [] },
      background: { type: "gradient", value: "linear-gradient(red, blue)" },
    };
    expect(layout.background?.type).toBe("gradient");
  });

  it("SceneLayout works without background", () => {
    const layout: SceneLayout = {
      sceneId: "idle",
      layout: { version: 1, name: "Test", widgets: [] },
    };
    expect(layout.background).toBeUndefined();
  });

  it("BackgroundConfig supports image with opacity", () => {
    const bg: BackgroundConfig = {
      type: "image",
      value: "https://example.com/bg.png",
      opacity: 0.5,
    };
    expect(bg.opacity).toBe(0.5);
  });
});
