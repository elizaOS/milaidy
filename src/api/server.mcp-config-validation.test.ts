import { describe, expect, it } from "vitest";
import {
  resolveMcpServersRejection,
  validateMcpServerConfig,
} from "./server.js";

describe("validateMcpServerConfig", () => {
  it("rejects stdio commands outside the allowlist", () => {
    const rejection = validateMcpServerConfig({
      type: "stdio",
      command: "/bin/bash",
    });

    expect(rejection).toContain("bare executable name");
  });

  it("allows known stdio launchers including path and extension forms", () => {
    const rejection = validateMcpServerConfig({
      type: "stdio",
      command: "npx.cmd",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    });

    expect(rejection).toBeNull();
  });

  it("rejects non-string stdio args", () => {
    const rejection = validateMcpServerConfig({
      type: "stdio",
      command: "npx",
      args: ["-y", 123],
    });

    expect(rejection).toBe("Each arg must be a string");
  });

  it("rejects blocked env keys and malformed env values", () => {
    const blockedKey = validateMcpServerConfig({
      type: "stdio",
      command: "npx",
      env: { NODE_OPTIONS: "--require ./payload.js" },
    });
    const badValue = validateMcpServerConfig({
      type: "stdio",
      command: "npx",
      env: { SAFE_KEY: 42 },
    });

    expect(blockedKey).toContain("not allowed for security reasons");
    expect(badValue).toBe("env.SAFE_KEY must be a string");
  });

  it("rejects path-based command values", () => {
    const rejection = validateMcpServerConfig({
      type: "stdio",
      command: "/tmp/npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem"],
    });

    expect(rejection).toContain("bare executable name");
  });

  it("rejects inline-eval flags for interpreter commands", () => {
    const nodeEval = validateMcpServerConfig({
      type: "stdio",
      command: "node",
      args: ["-e", "console.log('pwn')"],
    });
    const pythonEval = validateMcpServerConfig({
      type: "stdio",
      command: "python3",
      args: ["-c", "print('pwn')"],
    });
    const pythonAttachedEval = validateMcpServerConfig({
      type: "stdio",
      command: "python3",
      args: ['-cprint("pwn")'],
    });

    expect(nodeEval).toContain('Flag "-e" is not allowed');
    expect(pythonEval).toContain('Flag "-c" is not allowed');
    expect(pythonAttachedEval).toContain('Flag "-c" is not allowed');
  });

  it("rejects inline-exec flags for package runner commands", () => {
    const rejection = validateMcpServerConfig({
      type: "stdio",
      command: "npx",
      args: ["-c", "echo pwn"],
    });
    const attachedRejection = validateMcpServerConfig({
      type: "stdio",
      command: "npx",
      args: ["-cecho pwn"],
    });

    expect(rejection).toContain('Flag "-c" is not allowed');
    expect(attachedRejection).toContain('Flag "-c" is not allowed');
  });
});

describe("resolveMcpServersRejection", () => {
  it("rejects blocked server names", () => {
    const rejection = resolveMcpServersRejection({
      constructor: { type: "stdio", command: "npx" },
    });

    expect(rejection).toContain('Invalid server name: "constructor"');
  });

  it("rejects non-object server config entries", () => {
    const rejection = resolveMcpServersRejection({
      bad: "not-an-object",
    });

    expect(rejection).toBe('Server "bad" config must be a JSON object');
  });

  it("prefixes nested validation errors with server name", () => {
    const rejection = resolveMcpServersRejection({
      filesystem: { type: "stdio", command: "curl" },
    });

    expect(rejection).toContain('Server "filesystem":');
  });

  it("accepts safe server maps", () => {
    const rejection = resolveMcpServersRejection({
      files: {
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        env: { FOO: "bar" },
      },
      remote: {
        type: "streamable-http",
        url: "https://mcp.example.com",
      },
    });

    expect(rejection).toBeNull();
  });
});
