import type http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { isAllowedHost } from "./server.js";

/* ── Helper ────────────────────────────────────────────────────────── */

function fakeReq(host?: string): http.IncomingMessage {
  return {
    headers: host !== undefined ? { host } : {},
  } as http.IncomingMessage;
}

/* ── Tests ─────────────────────────────────────────────────────────── */

describe("isAllowedHost — DNS rebinding protection", () => {
  const savedBind = process.env.MILADY_API_BIND;
  afterEach(() => {
    if (savedBind === undefined) {
      delete process.env.MILADY_API_BIND;
    } else {
      process.env.MILADY_API_BIND = savedBind;
    }
  });

  /* ── Allowed hosts ────────────────────────────────────────────── */

  it("allows localhost", () => {
    expect(isAllowedHost(fakeReq("localhost"))).toBe(true);
  });

  it("allows localhost with port", () => {
    expect(isAllowedHost(fakeReq("localhost:31337"))).toBe(true);
  });

  it("allows 127.0.0.1", () => {
    expect(isAllowedHost(fakeReq("127.0.0.1"))).toBe(true);
  });

  it("allows 127.0.0.1 with port", () => {
    expect(isAllowedHost(fakeReq("127.0.0.1:31337"))).toBe(true);
  });

  it("allows [::1]", () => {
    expect(isAllowedHost(fakeReq("[::1]"))).toBe(true);
  });

  it("allows [::1] with port", () => {
    expect(isAllowedHost(fakeReq("[::1]:31337"))).toBe(true);
  });

  it("allows ::1 without brackets", () => {
    expect(isAllowedHost(fakeReq("::1"))).toBe(true);
  });

  it("allows full IPv6 loopback", () => {
    expect(isAllowedHost(fakeReq("[0:0:0:0:0:0:0:1]"))).toBe(true);
  });

  it("allows missing Host header (non-browser client)", () => {
    expect(isAllowedHost(fakeReq())).toBe(true);
  });

  it("allows empty Host header", () => {
    expect(isAllowedHost(fakeReq(""))).toBe(true);
  });

  /* ── Blocked hosts (DNS rebinding) ────────────────────────────── */

  it("blocks evil.com", () => {
    expect(isAllowedHost(fakeReq("evil.com"))).toBe(false);
  });

  it("blocks evil.com:31337", () => {
    expect(isAllowedHost(fakeReq("evil.com:31337"))).toBe(false);
  });

  it("blocks attacker.localhost", () => {
    expect(isAllowedHost(fakeReq("attacker.localhost"))).toBe(false);
  });

  it("blocks localhost.evil.com", () => {
    expect(isAllowedHost(fakeReq("localhost.evil.com"))).toBe(false);
  });

  it("blocks 0.0.0.0 (unspecified)", () => {
    expect(isAllowedHost(fakeReq("0.0.0.0"))).toBe(false);
  });

  it("blocks 192.168.1.1 (private IP)", () => {
    expect(isAllowedHost(fakeReq("192.168.1.1"))).toBe(false);
  });

  it("blocks 10.0.0.1", () => {
    expect(isAllowedHost(fakeReq("10.0.0.1"))).toBe(false);
  });

  /* ── Custom bind host ─────────────────────────────────────────── */

  it("allows custom MILADY_API_BIND host", () => {
    process.env.MILADY_API_BIND = "myhost.local";
    expect(isAllowedHost(fakeReq("myhost.local:31337"))).toBe(true);
  });

  it("still blocks unrelated hosts even with custom bind", () => {
    process.env.MILADY_API_BIND = "myhost.local";
    expect(isAllowedHost(fakeReq("evil.com"))).toBe(false);
  });
});
