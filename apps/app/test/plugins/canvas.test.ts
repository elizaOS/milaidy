// @vitest-environment jsdom
/**
 * Tests for @milady/capacitor-canvas — lifecycle, layers, error paths.
 *
 * Note: Drawing operations (drawRect, clear, etc.) require a real 2D canvas context
 * which is unavailable in Node.js. Those are tested via error paths for invalid IDs
 * and method existence checks. Full rendering is tested in browser/e2e tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasWeb } from "../../plugins/canvas/src/web";

// jsdom does not implement canvas 2D context — mock it so CanvasWeb.create()
// and createLayer() can obtain a context without throwing.
const stubContext = {
  fillStyle: "",
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(0), width: 0, height: 0 }),
  putImageData: vi.fn(),
  setTransform: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  rect: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  ellipse: vi.fn(),
  quadraticCurveTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  arcTo: vi.fn(),
  drawImage: vi.fn(),
  fillText: vi.fn(),
  globalAlpha: 1,
  font: "",
  textAlign: "left",
  textBaseline: "alphabetic",
} as unknown as CanvasRenderingContext2D;

const originalGetContext = HTMLCanvasElement.prototype.getContext;

describe("@milady/capacitor-canvas", () => {
  let c: CanvasWeb;

  beforeEach(() => {
    // Return our stub for any "2d" context request
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(stubContext) as typeof originalGetContext;
    c = new CanvasWeb();
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  // -- Canvas lifecycle --

  describe("lifecycle", () => {
    it("create returns a non-empty canvasId string", async () => {
      const { canvasId } = await c.create({
        size: { width: 800, height: 600 },
      });
      expect(typeof canvasId).toBe("string");
      expect(canvasId.length).toBeGreaterThan(0);
    });

    it("creates with zero size", async () => {
      expect(
        (await c.create({ size: { width: 0, height: 0 } })).canvasId,
      ).toBeDefined();
    });

    it("multiple creates return unique IDs", async () => {
      const a = (await c.create({ size: { width: 1, height: 1 } })).canvasId;
      const b = (await c.create({ size: { width: 1, height: 1 } })).canvasId;
      expect(a).not.toBe(b);
    });

    it("destroy on unknown ID is a silent no-op", async () => {
      await expect(c.destroy({ canvasId: "nope" })).resolves.toBeUndefined();
    });
  });

  // -- Layer management --

  describe("layers", () => {
    let canvasId: string;
    beforeEach(async () => {
      canvasId = (await c.create({ size: { width: 400, height: 400 } }))
        .canvasId;
    });

    it("createLayer returns layerId", async () => {
      const { layerId } = await c.createLayer({
        canvasId,
        layer: { visible: true, opacity: 1, zIndex: 0 },
      });
      expect(typeof layerId).toBe("string");
    });

    it("getLayers returns all created layers", async () => {
      await c.createLayer({
        canvasId,
        layer: { visible: true, opacity: 1, zIndex: 0 },
      });
      await c.createLayer({
        canvasId,
        layer: { visible: true, opacity: 0.5, zIndex: 1 },
      });
      expect((await c.getLayers({ canvasId })).layers).toHaveLength(2);
    });

    it("getLayers is empty for fresh canvas", async () => {
      expect((await c.getLayers({ canvasId })).layers).toEqual([]);
    });

    it("updateLayer changes properties", async () => {
      const { layerId } = await c.createLayer({
        canvasId,
        layer: { visible: true, opacity: 1, zIndex: 0 },
      });
      await c.updateLayer({
        canvasId,
        layerId,
        layer: { opacity: 0.5, visible: false },
      });
      const updated = (await c.getLayers({ canvasId })).layers.find(
        (l) => l.id === layerId,
      );
      expect(updated).toBeDefined();
      if (!updated) {
        throw new Error("updated layer not found");
      }
      expect(updated.opacity).toBe(0.5);
      expect(updated.visible).toBe(false);
    });

    it("deleteLayer on invalid ID throws 'Layer not found'", async () => {
      await expect(c.deleteLayer({ canvasId, layerId: "bad" })).rejects.toThrow(
        "Layer not found",
      );
    });

    it("deleteLayer on invalid canvas throws 'Canvas not found'", async () => {
      await expect(
        c.deleteLayer({ canvasId: "bad", layerId: "bad" }),
      ).rejects.toThrow("Canvas not found");
    });
  });

  // -- Error paths --

  describe("error paths", () => {
    it("clear on invalid canvas throws 'Canvas not found'", async () => {
      await expect(c.clear({ canvasId: "bad" })).rejects.toThrow(
        "Canvas not found",
      );
    });

    it("drawRect on invalid canvas throws 'Canvas not found'", async () => {
      await expect(
        c.drawRect({
          canvasId: "bad",
          rect: { x: 0, y: 0, width: 10, height: 10 },
        }),
      ).rejects.toThrow("Canvas not found");
    });

    it("eval without web view throws", async () => {
      await expect(c.eval({ script: "1+1" })).rejects.toThrow(/no web view/i);
    });
  });

  // -- Event listeners --

  describe("events", () => {
    it("registers and removes listener", async () => {
      const h = await c.addListener("touch", vi.fn());
      await h.remove();
    });

    it("removeAllListeners clears all", async () => {
      await c.addListener("touch", vi.fn());
      await c.addListener("render", vi.fn());
      await c.removeAllListeners();
    });
  });
});
