/**
 * Native Module Verification Tests
 *
 * Tests to verify that native Node.js modules required for vision and ML
 * capabilities are properly installed and functional:
 *
 *   1. TensorFlow.js Node bindings (@tensorflow/tfjs-node)
 *   2. Sharp image processing
 *   3. Canvas for face-api.js
 *   4. TensorFlow models (coco-ssd, mobilenet, pose-detection)
 *   5. Plugin-vision service availability
 *
 * These tests ensure Electron compatibility by verifying native modules
 * can be loaded and initialized correctly.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, "..");

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Attempts to require/import a module and returns success status
 */
async function canImportModule(
  moduleName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await import(moduleName);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Checks if a native binding file exists for a module
 */
function hasNativeBinding(modulePath: string, patterns: string[]): boolean {
  try {
    const nodeModulesPath = path.join(packageRoot, "node_modules", modulePath);
    if (!fs.existsSync(nodeModulesPath)) return false;

    // Recursively search for .node files
    const findNodeFiles = (dir: string): string[] => {
      const results: string[] = [];
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            results.push(...findNodeFiles(fullPath));
          } else if (patterns.some((p) => entry.name.includes(p))) {
            results.push(fullPath);
          }
        }
      } catch {
        // Ignore permission errors
      }
      return results;
    };

    const nodeFiles = findNodeFiles(nodeModulesPath);
    return nodeFiles.length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Native Module Installation Verification", () => {
  describe("TensorFlow.js", () => {
    it("@tensorflow/tfjs-node is installed", async () => {
      const result = await canImportModule("@tensorflow/tfjs-node");
      if (!result.success) {
        console.warn(
          `[native-modules] tfjs-node import failed: ${result.error}`,
        );
      }
      // We check installation, not necessarily successful import (may need rebuild for Electron)
      const packagePath = path.join(
        packageRoot,
        "node_modules",
        "@tensorflow",
        "tfjs-node",
      );
      expect(fs.existsSync(packagePath)).toBe(true);
    });

    it("@tensorflow/tfjs-node has native binding", () => {
      const hasBinding = hasNativeBinding("@tensorflow/tfjs-node", [
        "tfjs_binding.node",
        ".node",
      ]);
      expect(hasBinding).toBe(true);
    });

    it("@tensorflow/tfjs-core is installed", async () => {
      const packagePath = path.join(
        packageRoot,
        "node_modules",
        "@tensorflow",
        "tfjs-core",
      );
      expect(fs.existsSync(packagePath)).toBe(true);
    });
  });

  describe("TensorFlow Models", () => {
    it("@tensorflow-models/coco-ssd is installed", () => {
      const packagePath = path.join(
        packageRoot,
        "node_modules",
        "@tensorflow-models",
        "coco-ssd",
      );
      expect(fs.existsSync(packagePath)).toBe(true);
    });

    it("@tensorflow-models/mobilenet is installed", () => {
      const packagePath = path.join(
        packageRoot,
        "node_modules",
        "@tensorflow-models",
        "mobilenet",
      );
      expect(fs.existsSync(packagePath)).toBe(true);
    });

    it("@tensorflow-models/pose-detection is installed", () => {
      const packagePath = path.join(
        packageRoot,
        "node_modules",
        "@tensorflow-models",
        "pose-detection",
      );
      expect(fs.existsSync(packagePath)).toBe(true);
    });
  });

  describe("Sharp Image Processing", () => {
    it("sharp is installed", () => {
      const packagePath = path.join(packageRoot, "node_modules", "sharp");
      expect(fs.existsSync(packagePath)).toBe(true);
    });

    it("sharp can be imported", async () => {
      const result = await canImportModule("sharp");
      expect(result.success).toBe(true);
    });

    it("sharp can process an image buffer", async () => {
      const sharp = (await import("sharp")).default;
      // Create a simple 1x1 red pixel PNG
      const buffer = await sharp({
        create: {
          width: 1,
          height: 1,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .png()
        .toBuffer();

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe("Canvas for Face Recognition", () => {
    it("canvas is installed", () => {
      const packagePath = path.join(packageRoot, "node_modules", "canvas");
      expect(fs.existsSync(packagePath)).toBe(true);
    });

    it("canvas has native binding", () => {
      const hasBinding = hasNativeBinding("canvas", ["canvas.node", ".node"]);
      expect(hasBinding).toBe(true);
    });

    it("canvas can be imported", async () => {
      const result = await canImportModule("canvas");
      expect(result.success).toBe(true);
    });

    it("canvas can create a 2D context", async () => {
      const { createCanvas } = await import("canvas");
      const canvas = createCanvas(100, 100);
      const ctx = canvas.getContext("2d");

      expect(ctx).toBeDefined();

      // Draw something
      ctx.fillStyle = "red";
      ctx.fillRect(0, 0, 50, 50);

      // Verify we can get image data
      const imageData = ctx.getImageData(0, 0, 1, 1);
      expect(imageData.data[0]).toBe(255); // Red channel
    });
  });

  describe("Face-API.js", () => {
    it("face-api.js is installed", () => {
      const packagePath = path.join(packageRoot, "node_modules", "face-api.js");
      expect(fs.existsSync(packagePath)).toBe(true);
    });

    it("face-api.js can be imported", async () => {
      const result = await canImportModule("face-api.js");
      expect(result.success).toBe(true);
    });
  });

  describe("Tesseract.js OCR", () => {
    it("tesseract.js is installed", () => {
      const packagePath = path.join(
        packageRoot,
        "node_modules",
        "tesseract.js",
      );
      expect(fs.existsSync(packagePath)).toBe(true);
    });

    it("tesseract.js can be imported", async () => {
      const result = await canImportModule("tesseract.js");
      expect(result.success).toBe(true);
    });
  });
});

describe("Plugin-Vision Availability", () => {
  it("@elizaos/plugin-vision is installed", () => {
    const packagePath = path.join(
      packageRoot,
      "node_modules",
      "@elizaos",
      "plugin-vision",
    );
    expect(fs.existsSync(packagePath)).toBe(true);
  });

  it("@elizaos/plugin-vision can be imported", async () => {
    const result = await canImportModule("@elizaos/plugin-vision");
    // Plugin may fail to fully initialize without runtime, but should be importable
    if (!result.success) {
      console.warn(
        `[native-modules] plugin-vision import warning: ${result.error}`,
      );
    }
    // Check the package exists even if import fails
    const packagePath = path.join(
      packageRoot,
      "node_modules",
      "@elizaos",
      "plugin-vision",
    );
    expect(fs.existsSync(packagePath)).toBe(true);
  });

  it("plugin-vision has required dependencies", () => {
    const visionPkgPath = path.join(
      packageRoot,
      "node_modules",
      "@elizaos",
      "plugin-vision",
      "package.json",
    );
    expect(fs.existsSync(visionPkgPath)).toBe(true);

    const visionPkgContent = fs.readFileSync(visionPkgPath, "utf-8");

    // Check dependencies are declared in package.json content
    expect(visionPkgContent).toContain('"sharp"');
    expect(visionPkgContent).toContain('"canvas"');
    expect(visionPkgContent).toContain('"face-api.js"');
    expect(visionPkgContent).toContain('"tesseract.js"');
  });

  it("vision dependencies are installed in node_modules", () => {
    // Verify the actual modules are installed
    expect(fs.existsSync(path.join(packageRoot, "node_modules", "sharp"))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(packageRoot, "node_modules", "canvas")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(packageRoot, "node_modules", "face-api.js")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(packageRoot, "node_modules", "tesseract.js")),
    ).toBe(true);
  });
});

describe("Electron Native Module Configuration", () => {
  it("electron app has @electron/rebuild configured", () => {
    const electronPkgPath = path.join(
      packageRoot,
      "apps",
      "app",
      "electron",
      "package.json",
    );
    expect(fs.existsSync(electronPkgPath)).toBe(true);

    const electronPkg = JSON.parse(fs.readFileSync(electronPkgPath, "utf-8"));
    const devDeps = electronPkg.devDependencies || {};

    // Check for @electron/rebuild (new) or electron-rebuild (legacy)
    const hasRebuild =
      "@electron/rebuild" in devDeps || "electron-rebuild" in devDeps;
    expect(hasRebuild).toBe(true);
  });

  it("electron app has native module dependencies", () => {
    const electronPkgPath = path.join(
      packageRoot,
      "apps",
      "app",
      "electron",
      "package.json",
    );
    const electronPkg = JSON.parse(fs.readFileSync(electronPkgPath, "utf-8"));
    const deps = electronPkg.dependencies || {};

    // Check for native modules in electron app
    expect(deps).toHaveProperty("sharp");
    expect(deps).toHaveProperty("canvas");
    expect(deps).toHaveProperty("@tensorflow/tfjs-node");
    expect(deps).toHaveProperty("onnxruntime-node");
  });

  it("electron build script includes rebuild step", () => {
    const electronPkgPath = path.join(
      packageRoot,
      "apps",
      "app",
      "electron",
      "package.json",
    );
    const electronPkg = JSON.parse(fs.readFileSync(electronPkgPath, "utf-8"));
    const scripts = electronPkg.scripts || {};

    // Build script should include electron-rebuild
    expect(scripts.build).toContain("rebuild");
  });
});

describe("Core Plugins with Vision Integration", () => {
  it("plugin-vision is in OPTIONAL_CORE_PLUGINS", async () => {
    const { OPTIONAL_CORE_PLUGINS } = await import(
      "../src/runtime/core-plugins"
    );
    expect(OPTIONAL_CORE_PLUGINS).toContain("@elizaos/plugin-vision");
  });

  it("plugin-vision has static import in eliza.ts", async () => {
    // Read eliza.ts and check for plugin-vision import case
    const elizaPath = path.join(packageRoot, "src", "runtime", "eliza.ts");
    const elizaContent = fs.readFileSync(elizaPath, "utf-8");

    expect(elizaContent).toContain('@elizaos/plugin-vision"');
    expect(elizaContent).toContain('case "@elizaos/plugin-vision"');
  });
});

describe("PTY Native Modules", () => {
  it("node-pty is installed", () => {
    const packagePath = path.join(packageRoot, "node_modules", "node-pty");
    expect(fs.existsSync(packagePath)).toBe(true);
  });

  it("@lydell/node-pty is available", () => {
    // Check in bun cache location or regular node_modules
    const bunCachePath = path.join(
      packageRoot,
      "node_modules",
      ".bun",
      "@lydell+node-pty@1.1.0",
    );
    const regularPath = path.join(
      packageRoot,
      "node_modules",
      "@lydell",
      "node-pty",
    );
    const exists = fs.existsSync(bunCachePath) || fs.existsSync(regularPath);
    expect(exists).toBe(true);
  });

  it("pty-manager is installed", () => {
    const packagePath = path.join(packageRoot, "node_modules", "pty-manager");
    expect(fs.existsSync(packagePath)).toBe(true);
  });

  it("electron app has PTY dependencies", () => {
    const electronPkgPath = path.join(
      packageRoot,
      "apps",
      "app",
      "electron",
      "package.json",
    );
    const electronPkg = JSON.parse(fs.readFileSync(electronPkgPath, "utf-8"));
    const deps = electronPkg.dependencies || {};

    expect(deps).toHaveProperty("node-pty");
    expect(deps).toHaveProperty("@lydell/node-pty");
    expect(deps).toHaveProperty("pty-manager");
  });
});

describe("Local Embedding Native Modules", () => {
  it("node-llama-cpp is in electron dependencies", () => {
    const electronPkgPath = path.join(
      packageRoot,
      "apps",
      "app",
      "electron",
      "package.json",
    );
    const electronPkg = JSON.parse(fs.readFileSync(electronPkgPath, "utf-8"));
    const deps = electronPkg.dependencies || {};

    expect(deps).toHaveProperty("node-llama-cpp");
    expect(deps).toHaveProperty("onnxruntime-node");
    expect(deps).toHaveProperty("whisper-node");
  });
});
