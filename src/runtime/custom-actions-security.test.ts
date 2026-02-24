/**
 * Regression tests for custom actions security hardening.
 *
 * Verifies:
 *  1. tokenMatches uses constant-time comparison (same as resolveTerminalRunRejection)
 *  2. node:vm sandbox blocks this.constructor chain escape (Object.create(null))
 *  3. node:vm sandbox blocks fetch.constructor escape (sandbox-native wrapper)
 *  4. node:vm sandbox prevents access to process, require, and global
 *
 * NOTE: We cannot import resolveTerminalRunRejection from server.ts directly
 * because it pulls in heavy deps (@milaidy/plugin-coding-agent, ws, etc.).
 * Instead we test the tokenMatches logic inline (same implementation) and
 * verify the vm hardening techniques used in custom-actions.ts.
 */

import crypto from "node:crypto";
import vm from "node:vm";
import { afterEach, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// 1. Token matching / gate logic tests
//
// tokenMatches is the core of resolveTerminalRunRejection — it uses
// crypto.timingSafeEqual to prevent timing attacks. We re-implement it
// here identically to verify the security property.
// ---------------------------------------------------------------------------

function tokenMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) {
    const padded = Buffer.alloc(a.length);
    b.copy(padded, 0, 0, Math.min(b.length, a.length));
    return crypto.timingSafeEqual(a, padded) && false;
  }
  return crypto.timingSafeEqual(a, b);
}

describe("custom actions terminal token gate logic", () => {
  it("rejects when tokens do not match", () => {
    expect(tokenMatches("correct-token", "wrong-token")).toBe(false);
  });

  it("rejects when provided token is empty", () => {
    expect(tokenMatches("correct-token", "")).toBe(false);
  });

  it("rejects when tokens have different lengths", () => {
    expect(tokenMatches("short", "a-much-longer-token")).toBe(false);
  });

  it("accepts when tokens match exactly", () => {
    expect(tokenMatches("correct-token", "correct-token")).toBe(true);
  });

  it("rejects near-miss tokens (off by one character)", () => {
    expect(tokenMatches("correct-token", "correct-tokeN")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2-4. VM sandbox escape prevention tests
//
// These directly verify the hardening techniques used in custom-actions.ts:
//   - Object.create(null) context prevents this.constructor traversal
//   - sandbox-native fetch wrapper prevents fetch.constructor escape
//   - process, require, global are all undefined in the sandbox
// ---------------------------------------------------------------------------

describe("custom actions vm sandbox hardening", () => {
  it("blocks this.constructor.constructor escape with null-prototype context", () => {
    const context: Record<string, unknown> = Object.create(null);
    context.params = Object.freeze({});

    const escapeScript = `
      try {
        const p = this.constructor.constructor('return process')();
        'ESCAPED: ' + typeof p;
      } catch (e) {
        'BLOCKED: ' + e.message;
      }
    `;
    const result = vm.runInNewContext(
      `"use strict"; ${escapeScript}`,
      context,
      { timeout: 1000 },
    );
    expect(result).toMatch(/^BLOCKED:/);
  });

  it("blocks fetch.constructor escape with sandbox-native wrapper", () => {
    const hostFunction = (input: unknown) => input;

    // Same technique as custom-actions.ts: compile wrapper inside VM context
    const wrapperScript = `(function(hostFn) {
      return function wrappedFetch(input, init) { return hostFn(input, init); };
    })`;
    const wrapCtx = Object.create(null);
    const wrapFn = vm.runInNewContext(wrapperScript, wrapCtx, {
      timeout: 1000,
    }) as (fn: typeof hostFunction) => typeof hostFunction;

    const sandboxContext: Record<string, unknown> = Object.create(null);
    sandboxContext.fetch = wrapFn(hostFunction);

    const escapeScript = `
      try {
        const F = fetch.constructor;
        const p = F('return process')();
        'ESCAPED: ' + typeof p;
      } catch (e) {
        'BLOCKED: ' + e.message;
      }
    `;
    const result = vm.runInNewContext(
      `"use strict"; ${escapeScript}`,
      sandboxContext,
      { timeout: 1000 },
    );
    // sandbox-native Function constructor cannot access host globals
    expect(result).not.toMatch(/^ESCAPED/);
  });

  it("confirms host function IS escapable without wrapping (proves wrapper is necessary)", () => {
    // This test proves that WITHOUT the sandbox wrapper, the escape works.
    // It validates that our defense is actually needed.
    const hostFunction = (input: unknown) => input;

    const context: Record<string, unknown> = Object.create(null);
    context.fetch = hostFunction; // Direct host reference — no wrapper

    const escapeScript = `
      try {
        const F = fetch.constructor;
        const p = F('return process')();
        'ESCAPED: ' + typeof p;
      } catch (e) {
        'BLOCKED: ' + e.message;
      }
    `;
    const result = vm.runInNewContext(
      `"use strict"; ${escapeScript}`,
      context,
      { timeout: 1000 },
    );
    // Without wrapping, the host Function constructor CAN access process
    expect(result).toBe("ESCAPED: object");
  });

  it("prevents access to process, require, and global from sandbox", () => {
    const context: Record<string, unknown> = Object.create(null);
    context.params = Object.freeze({});

    const script = `
      const results = [];
      results.push('process:' + (typeof process));
      results.push('require:' + (typeof require));
      results.push('global:' + (typeof global));
      results.join(',');
    `;
    const result = vm.runInNewContext(`"use strict"; ${script}`, context, {
      timeout: 1000,
    });
    expect(result).toBe("process:undefined,require:undefined,global:undefined");
  });
});
