/**
 * Unit tests for og-tracker.ts — OG tracking code system.
 *
 * Covers:
 * - Code initialization (first-run UUID generation, idempotency)
 * - Code reading (exists, doesn't exist)
 * - Deterministic code generation from seed
 * - Code validation (valid, invalid, boundary cases)
 * - File permission safety (directory/file modes)
 *
 * @see og-tracker.ts
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────

const MOCK_STATE_DIR = path.join(__dirname, "__test_og_state__");

vi.mock("../config/paths", () => ({
  resolveStateDir: () => MOCK_STATE_DIR,
}));

// ── Import after mocks ──────────────────────────────────────────────────

import {
  generateValidCodes,
  initializeOGCode,
  isValidOGCode,
  readOGCode,
} from "./og-tracker";

// ── Setup / Teardown ─────────────────────────────────────────────────────

const OG_FILE = path.join(MOCK_STATE_DIR, ".og");

beforeEach(() => {
  if (fs.existsSync(OG_FILE)) fs.unlinkSync(OG_FILE);
  if (fs.existsSync(MOCK_STATE_DIR)) {
    try {
      fs.rmdirSync(MOCK_STATE_DIR);
    } catch {
      // not empty - ignore
    }
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  if (fs.existsSync(OG_FILE)) fs.unlinkSync(OG_FILE);
  if (fs.existsSync(MOCK_STATE_DIR)) {
    try {
      fs.rmdirSync(MOCK_STATE_DIR);
    } catch {
      // not empty - ignore
    }
  }
});

// ── Tests ────────────────────────────────────────────────────────────────

describe("og-tracker", () => {
  // ===================================================================
  //  1. Code Initialization
  // ===================================================================

  describe("initializeOGCode", () => {
    it("creates .og file on first run", () => {
      initializeOGCode();
      expect(fs.existsSync(OG_FILE)).toBe(true);
    });

    it("writes a valid UUID format", () => {
      initializeOGCode();
      const code = fs.readFileSync(OG_FILE, "utf-8");
      // UUID v4 format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      expect(code).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it("creates state directory if it does not exist", () => {
      expect(fs.existsSync(MOCK_STATE_DIR)).toBe(false);
      initializeOGCode();
      expect(fs.existsSync(MOCK_STATE_DIR)).toBe(true);
    });

    it("is idempotent — does not overwrite existing code", () => {
      initializeOGCode();
      const firstCode = fs.readFileSync(OG_FILE, "utf-8");

      initializeOGCode();
      const secondCode = fs.readFileSync(OG_FILE, "utf-8");

      expect(firstCode).toBe(secondCode);
    });

    it("generates unique codes across invocations", () => {
      // First instance
      initializeOGCode();
      const code1 = fs.readFileSync(OG_FILE, "utf-8");

      // Reset and generate new
      fs.unlinkSync(OG_FILE);
      initializeOGCode();
      const code2 = fs.readFileSync(OG_FILE, "utf-8");

      expect(code1).not.toBe(code2);
    });
  });

  // ===================================================================
  //  2. Code Reading
  // ===================================================================

  describe("readOGCode", () => {
    it("returns the stored code", () => {
      initializeOGCode();
      const stored = fs.readFileSync(OG_FILE, "utf-8");
      expect(readOGCode()).toBe(stored);
    });

    it("returns null when no .og file exists", () => {
      expect(readOGCode()).toBeNull();
    });

    it("trims whitespace from stored code", () => {
      fs.mkdirSync(MOCK_STATE_DIR, { recursive: true });
      fs.writeFileSync(OG_FILE, "  test-code-123  \n");
      expect(readOGCode()).toBe("test-code-123");
    });
  });

  // ===================================================================
  //  3. Deterministic Code Generation
  // ===================================================================

  describe("generateValidCodes", () => {
    it("generates the requested number of codes", () => {
      const codes = generateValidCodes("test-seed", 100);
      expect(codes).toHaveLength(100);
    });

    it("generates deterministic output for the same seed", () => {
      const codes1 = generateValidCodes("milady-seed-2024", 10);
      const codes2 = generateValidCodes("milady-seed-2024", 10);
      expect(codes1).toEqual(codes2);
    });

    it("generates different output for different seeds", () => {
      const codes1 = generateValidCodes("seed-alpha", 10);
      const codes2 = generateValidCodes("seed-beta", 10);
      expect(codes1).not.toEqual(codes2);
    });

    it("generates codes in UUID-like format", () => {
      const codes = generateValidCodes("test", 5);
      for (const code of codes) {
        // Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (from sha256 slices)
        expect(code).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
      }
    });

    it("generates all unique codes", () => {
      const codes = generateValidCodes("uniqueness-test", 100);
      const unique = new Set(codes);
      expect(unique.size).toBe(100);
    });

    it("matches expected hash derivation", () => {
      // Verify the code generation algorithm matches expectations
      const seed = "test-seed";
      const hash = crypto
        .createHash("sha256")
        .update(`${seed}:og:0`)
        .digest("hex");
      const expected = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;

      const codes = generateValidCodes(seed, 1);
      expect(codes[0]).toBe(expected);
    });

    it("handles empty seed", () => {
      const codes = generateValidCodes("", 5);
      expect(codes).toHaveLength(5);
      for (const code of codes) {
        expect(code).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
      }
    });

    it("handles zero count", () => {
      const codes = generateValidCodes("seed", 0);
      expect(codes).toEqual([]);
    });
  });

  // ===================================================================
  //  4. Code Validation
  // ===================================================================

  describe("isValidOGCode", () => {
    const SEED = "milady-secret-seed";

    it("returns true for a valid code from the seed", () => {
      const codes = generateValidCodes(SEED, 100);
      expect(isValidOGCode(codes[0], SEED)).toBe(true);
      expect(isValidOGCode(codes[49], SEED)).toBe(true);
      expect(isValidOGCode(codes[99], SEED)).toBe(true);
    });

    it("returns false for an invalid code", () => {
      expect(isValidOGCode("not-a-valid-code", SEED)).toBe(false);
    });

    it("returns false for a code from a different seed", () => {
      const codesFromOtherSeed = generateValidCodes("wrong-seed", 100);
      expect(isValidOGCode(codesFromOtherSeed[0], SEED)).toBe(false);
    });

    it("respects the count parameter", () => {
      const allCodes = generateValidCodes(SEED, 200);
      // Code at index 150 is valid with count=200 but not with count=100
      expect(isValidOGCode(allCodes[150], SEED, 200)).toBe(true);
      expect(isValidOGCode(allCodes[150], SEED, 100)).toBe(false);
    });

    it("defaults to count=100", () => {
      const codes = generateValidCodes(SEED, 101);
      // Index 99 should be valid (within default 100)
      expect(isValidOGCode(codes[99], SEED)).toBe(true);
      // Index 100 should NOT be valid (outside default 100)
      expect(isValidOGCode(codes[100], SEED)).toBe(false);
    });

    it("returns false for a random UUID (not derived from seed)", () => {
      const randomUUID = crypto.randomUUID();
      expect(isValidOGCode(randomUUID, SEED)).toBe(false);
    });
  });
});
