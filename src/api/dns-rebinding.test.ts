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
  const savedAllowed = process.env.MILADY_ALLOWED_HOSTS;
  afterEach(() => {
    if (savedBind === undefined) {
      delete process.env.MILADY_API_BIND;
    } else {
      process.env.MILADY_API_BIND = savedBind;
    }
    if (savedAllowed === undefined) {
      delete process.env.MILADY_ALLOWED_HOSTS;
    } else {
      process.env.MILADY_ALLOWED_HOSTS = savedAllowed;
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

  /* ── Wildcard bind (0.0.0.0 / ::) ────────────────────────────── */

  it("allows any hostname when MILADY_API_BIND=0.0.0.0", () => {
    process.env.MILADY_API_BIND = "0.0.0.0";
    expect(isAllowedHost(fakeReq("192.168.1.42"))).toBe(true);
  });

  it("allows LAN IP with port when MILADY_API_BIND=0.0.0.0", () => {
    process.env.MILADY_API_BIND = "0.0.0.0";
    expect(isAllowedHost(fakeReq("192.168.1.42:31337"))).toBe(true);
  });

  it("allows arbitrary hostname when MILADY_API_BIND=0.0.0.0", () => {
    process.env.MILADY_API_BIND = "0.0.0.0";
    expect(isAllowedHost(fakeReq("myserver.local"))).toBe(true);
  });

  it("allows any hostname when MILADY_API_BIND=::", () => {
    process.env.MILADY_API_BIND = "::";
    expect(isAllowedHost(fakeReq("10.0.0.1"))).toBe(true);
  });

  it("allows any hostname when MILADY_API_BIND=0.0.0.0 with port suffix", () => {
    process.env.MILADY_API_BIND = "0.0.0.0:31337";
    expect(isAllowedHost(fakeReq("192.168.1.1"))).toBe(true);
  });

  /* ── MILADY_ALLOWED_HOSTS ─────────────────────────────────────── */

  it("allows hostname listed in MILADY_ALLOWED_HOSTS", () => {
    process.env.MILADY_ALLOWED_HOSTS = "myserver.local";
    expect(isAllowedHost(fakeReq("myserver.local"))).toBe(true);
  });

  it("allows hostname with port when listed in MILADY_ALLOWED_HOSTS", () => {
    process.env.MILADY_ALLOWED_HOSTS = "myserver.local";
    expect(isAllowedHost(fakeReq("myserver.local:31337"))).toBe(true);
  });

  it("allows one of multiple comma-separated MILADY_ALLOWED_HOSTS", () => {
    process.env.MILADY_ALLOWED_HOSTS = "myserver.local,192.168.1.10,staging.internal";
    expect(isAllowedHost(fakeReq("192.168.1.10"))).toBe(true);
    expect(isAllowedHost(fakeReq("staging.internal"))).toBe(true);
  });

  it("blocks hostname not in MILADY_ALLOWED_HOSTS", () => {
    process.env.MILADY_ALLOWED_HOSTS = "myserver.local";
    expect(isAllowedHost(fakeReq("evil.com"))).toBe(false);
  });

  it("MILADY_ALLOWED_HOSTS is case-insensitive", () => {
    process.env.MILADY_ALLOWED_HOSTS = "MyServer.Local";
    expect(isAllowedHost(fakeReq("myserver.local"))).toBe(true);
  });

  it("MILADY_ALLOWED_HOSTS with spaces around commas", () => {
    process.env.MILADY_ALLOWED_HOSTS = " myserver.local , 192.168.1.10 ";
    expect(isAllowedHost(fakeReq("myserver.local"))).toBe(true);
    expect(isAllowedHost(fakeReq("192.168.1.10"))).toBe(true);
  });
});
