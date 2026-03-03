import { describe, expect, it } from "vitest";
import {
  cloneWithoutBlockedObjectKeys,
  validateMcpServerConfig,
} from "./server";

// ---------------------------------------------------------------------------
// 1. Connector config $include injection — regression test
//
// POST /api/connectors now passes body.config through
// cloneWithoutBlockedObjectKeys() before assignment.  These tests verify
// that $include, __proto__, constructor, and prototype keys are stripped.
// ---------------------------------------------------------------------------

describe("cloneWithoutBlockedObjectKeys — connector config sanitization", () => {
  it("strips $include at the top level", () => {
    const input = { $include: "/etc/passwd", name: "safe" };
    const result = cloneWithoutBlockedObjectKeys(input);
    expect(result).not.toHaveProperty("$include");
    expect(result).toHaveProperty("name", "safe");
  });

  it("strips $include nested inside config", () => {
    const input = {
      token: "abc",
      settings: {
        $include: "~/.milady/auth/credentials.json",
        foo: "bar",
      },
    };
    const result = cloneWithoutBlockedObjectKeys(input);
    expect(result.settings).not.toHaveProperty("$include");
    expect(result.settings).toHaveProperty("foo", "bar");
  });

  it("strips __proto__ keys", () => {
    const input = JSON.parse('{"__proto__": {"admin": true}, "ok": 1}');
    const result = cloneWithoutBlockedObjectKeys(input);
    expect(result).not.toHaveProperty("__proto__");
    expect(result).toHaveProperty("ok", 1);
  });

  it("strips constructor and prototype keys", () => {
    const input = { constructor: "evil", prototype: "evil", valid: true };
    const result = cloneWithoutBlockedObjectKeys(input);
    expect(result).not.toHaveProperty("constructor");
    expect(result).not.toHaveProperty("prototype");
    expect(result).toHaveProperty("valid", true);
  });

  it("strips blocked keys inside arrays of objects", () => {
    const input = [{ $include: "/etc/shadow", name: "a" }, { name: "b" }];
    const result = cloneWithoutBlockedObjectKeys(input);
    expect(result[0]).not.toHaveProperty("$include");
    expect(result[0]).toHaveProperty("name", "a");
    expect(result[1]).toHaveProperty("name", "b");
  });

  it("preserves legitimate keys that resemble blocked ones", () => {
    const input = { include: "fine", $other: "fine", name: "ok" };
    const result = cloneWithoutBlockedObjectKeys(input);
    expect(result).toHaveProperty("include", "fine");
    expect(result).toHaveProperty("$other", "fine");
    expect(result).toHaveProperty("name", "ok");
  });
});

// ---------------------------------------------------------------------------
// 2. MCP container flag blocklist — regression tests
// ---------------------------------------------------------------------------

describe("MCP container flag blocklist", () => {
  const makeStdioConfig = (args: string[]) => ({
    type: "stdio",
    command: "docker",
    args,
  });

  it("blocks --device (host device access)", async () => {
    const result = await validateMcpServerConfig(
      makeStdioConfig(["run", "--device", "/dev/sda:/dev/sda", "img"]),
    );
    expect(result).toContain("--device");
  });

  it("blocks --ipc=host (IPC namespace escape)", async () => {
    const result = await validateMcpServerConfig(
      makeStdioConfig(["run", "--ipc=host", "img"]),
    );
    expect(result).toContain("--ipc");
  });

  it("blocks --uts=host (UTS namespace escape)", async () => {
    const result = await validateMcpServerConfig(
      makeStdioConfig(["run", "--uts=host", "img"]),
    );
    expect(result).toContain("--uts");
  });

  it("blocks --userns=host (user namespace escape)", async () => {
    const result = await validateMcpServerConfig(
      makeStdioConfig(["run", "--userns=host", "img"]),
    );
    expect(result).toContain("--userns");
  });

  it("blocks --cgroupns=host (cgroup namespace escape)", async () => {
    const result = await validateMcpServerConfig(
      makeStdioConfig(["run", "--cgroupns=host", "img"]),
    );
    expect(result).toContain("--cgroupns");
  });

  it("still blocks original flags (--privileged, -v, --mount, etc.)", async () => {
    for (const flag of [
      "--privileged",
      "-v",
      "--volume",
      "--mount",
      "--cap-add",
      "--security-opt",
      "--pid",
      "--network",
    ]) {
      const result = await validateMcpServerConfig(
        makeStdioConfig(["run", flag, "value", "img"]),
      );
      expect(result).toContain(flag);
    }
  });

  it("allows safe docker commands without blocked flags", async () => {
    const result = await validateMcpServerConfig(
      makeStdioConfig(["run", "--rm", "mcp-server-image"]),
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. MCP interpreter inspector flag blocklist — regression tests
//
// --inspect, --inspect-brk, --inspect-wait open a V8 inspector debug port
// (default 9229) that allows unauthenticated RCE via Chrome DevTools Protocol.
// These must be blocked for all interpreter commands (node, bun, deno, etc.).
// ---------------------------------------------------------------------------

describe("MCP interpreter inspector flag blocklist", () => {
  const makeNodeConfig = (args: string[]) => ({
    type: "stdio",
    command: "node",
    args,
  });

  it("blocks --inspect (V8 inspector RCE)", async () => {
    const result = await validateMcpServerConfig(
      makeNodeConfig(["--inspect", "server.js"]),
    );
    expect(result).toContain("--inspect");
    expect(result).toContain("not allowed");
  });

  it("blocks --inspect=0.0.0.0:9229 (network-bound inspector)", async () => {
    const result = await validateMcpServerConfig(
      makeNodeConfig(["--inspect=0.0.0.0:9229", "server.js"]),
    );
    expect(result).toContain("--inspect");
  });

  it("blocks --inspect-brk (break-on-start inspector)", async () => {
    const result = await validateMcpServerConfig(
      makeNodeConfig(["--inspect-brk", "server.js"]),
    );
    expect(result).toContain("--inspect-brk");
  });

  it("blocks --inspect-brk=host:port", async () => {
    const result = await validateMcpServerConfig(
      makeNodeConfig(["--inspect-brk=127.0.0.1:9230", "server.js"]),
    );
    expect(result).toContain("--inspect-brk");
  });

  it("blocks --inspect-wait", async () => {
    const result = await validateMcpServerConfig(
      makeNodeConfig(["--inspect-wait", "server.js"]),
    );
    expect(result).toContain("--inspect-wait");
  });

  it("blocks --inspect-port", async () => {
    const result = await validateMcpServerConfig(
      makeNodeConfig(["--inspect-port=9229", "server.js"]),
    );
    expect(result).toContain("--inspect-port");
  });

  it("blocks --inspect-publish-uid", async () => {
    const result = await validateMcpServerConfig(
      makeNodeConfig(["--inspect-publish-uid=http", "server.js"]),
    );
    expect(result).toContain("--inspect-publish-uid");
  });

  it("blocks --experimental-policy (arbitrary file read)", async () => {
    const result = await validateMcpServerConfig(
      makeNodeConfig(["--experimental-policy=/tmp/evil.json", "server.js"]),
    );
    expect(result).toContain("--experimental-policy");
  });

  it("blocks --diagnostic-dir (directory write)", async () => {
    const result = await validateMcpServerConfig(
      makeNodeConfig(["--diagnostic-dir=/tmp/exfil", "server.js"]),
    );
    expect(result).toContain("--diagnostic-dir");
  });

  it("blocks inspector flags for bun too", async () => {
    const result = await validateMcpServerConfig({
      type: "stdio",
      command: "bun",
      args: ["--inspect=0.0.0.0:6499", "server.ts"],
    });
    expect(result).toContain("--inspect");
  });

  it("blocks inspector flags for deno too", async () => {
    const result = await validateMcpServerConfig({
      type: "stdio",
      command: "deno",
      args: ["run", "--inspect=0.0.0.0:9229", "server.ts"],
    });
    expect(result).toContain("--inspect");
  });

  it("allows safe interpreter commands without inspector flags", async () => {
    const result = await validateMcpServerConfig(
      makeNodeConfig(["server.js", "--port", "3000"]),
    );
    expect(result).toBeNull();
  });
});
