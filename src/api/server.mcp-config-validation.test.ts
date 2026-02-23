import { lookup as dnsLookup } from "node:dns/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveMcpServersRejection,
  validateMcpServerConfig,
} from "./server.js";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

describe("validateMcpServerConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dnsLookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects stdio commands outside the allowlist", async () => {
    const rejection = await validateMcpServerConfig({
      type: "stdio",
      command: "/bin/bash",
    });

    expect(rejection).toContain("bare executable name");
  });

  it("allows known stdio launchers including path and extension forms", async () => {
    const rejection = await validateMcpServerConfig({
      type: "stdio",
      command: "npx.cmd",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    });

    expect(rejection).toBeNull();
  });

  it("rejects non-string stdio args", async () => {
    const rejection = await validateMcpServerConfig({
      type: "stdio",
      command: "npx",
      args: ["-y", 123],
    });

    expect(rejection).toBe("Each arg must be a string");
  });

  it("rejects blocked env keys and malformed env values", async () => {
    const blockedKey = await validateMcpServerConfig({
      type: "stdio",
      command: "npx",
      env: { NODE_OPTIONS: "--require ./payload.js" },
    });
    const badValue = await validateMcpServerConfig({
      type: "stdio",
      command: "npx",
      env: { SAFE_KEY: 42 },
    });

    expect(blockedKey).toContain("not allowed for security reasons");
    expect(badValue).toBe("env.SAFE_KEY must be a string");
  });

  it("rejects path-based command values", async () => {
    const rejection = await validateMcpServerConfig({
      type: "stdio",
      command: "/tmp/npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem"],
    });

    expect(rejection).toContain("bare executable name");
  });

  it("rejects inline-eval flags for interpreter commands", async () => {
    const nodeEval = await validateMcpServerConfig({
      type: "stdio",
      command: "node",
      args: ["-e", "console.log('pwn')"],
    });
    const pythonEval = await validateMcpServerConfig({
      type: "stdio",
      command: "python3",
      args: ["-c", "print('pwn')"],
    });
    const pythonAttachedEval = await validateMcpServerConfig({
      type: "stdio",
      command: "python3",
      args: ['-cprint("pwn")'],
    });
    const uvEval = await validateMcpServerConfig({
      type: "stdio",
      command: "uv",
      args: ["run", "-c", "print('pwn')"],
    });

    expect(nodeEval).toContain('Flag "-e" is not allowed');
    expect(pythonEval).toContain('Flag "-c" is not allowed');
    expect(pythonAttachedEval).toContain('Flag "-c" is not allowed');
    expect(uvEval).toContain('Flag "-c" is not allowed');
  });

  it("rejects interpreter bootstrap flags that can execute preload code", async () => {
    const nodeImport = await validateMcpServerConfig({
      type: "stdio",
      command: "node",
      args: ["--import", "data:text/javascript,console.log('pwn')"],
    });
    const nodeRequireAttached = await validateMcpServerConfig({
      type: "stdio",
      command: "node",
      args: ["-r./bootstrap.js", "server.js"],
    });

    expect(nodeImport).toContain('Flag "--import" is not allowed');
    expect(nodeRequireAttached).toContain('Flag "-r" is not allowed');
  });

  it("rejects inline-exec flags for package runner commands", async () => {
    const rejection = await validateMcpServerConfig({
      type: "stdio",
      command: "npx",
      args: ["-c", "echo pwn"],
    });
    const attachedRejection = await validateMcpServerConfig({
      type: "stdio",
      command: "npx",
      args: ["-cecho pwn"],
    });

    expect(rejection).toContain('Flag "-c" is not allowed');
    expect(attachedRejection).toContain('Flag "-c" is not allowed');
  });

  it("rejects dangerous container flags for docker/podman", async () => {
    const dockerPrivileged = await validateMcpServerConfig({
      type: "stdio",
      command: "docker",
      args: ["run", "--privileged", "alpine"],
    });
    const podmanVolume = await validateMcpServerConfig({
      type: "stdio",
      command: "podman",
      args: ["run", "-v", "/:/host", "alpine"],
    });

    expect(dockerPrivileged).toContain('Flag "--privileged" is not allowed');
    expect(podmanVolume).toContain('Flag "-v" is not allowed');
  });

  it("rejects deno eval subcommand", async () => {
    const rejection = await validateMcpServerConfig({
      type: "stdio",
      command: "deno",
      args: ["eval", "console.log('pwn')"],
    });

    expect(rejection).toContain('Subcommand "eval" is not allowed');
  });

  it("rejects remote URLs with non-http protocols", async () => {
    const rejection = await validateMcpServerConfig({
      type: "streamable-http",
      url: "file:///etc/passwd",
    });

    expect(rejection).toBe("URL must use http:// or https://");
  });

  it("rejects remote URLs targeting blocked local hosts", async () => {
    const rejection = await validateMcpServerConfig({
      type: "streamable-http",
      url: "http://localhost:8080/mcp",
    });

    expect(rejection).toContain('URL host "localhost" is blocked');
  });

  it("rejects remote URLs when DNS resolves to blocked addresses", async () => {
    vi.mocked(dnsLookup).mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
    ]);
    const rejection = await validateMcpServerConfig({
      type: "streamable-http",
      url: "https://metadata.nip.io/mcp",
    });

    expect(rejection).toContain("resolves to blocked address 127.0.0.1");
  });

  it("rejects remote URLs when DNS lookup fails", async () => {
    vi.mocked(dnsLookup).mockRejectedValue(new Error("DNS failure"));
    const rejection = await validateMcpServerConfig({
      type: "streamable-http",
      url: "https://mcp.example.com/mcp",
    });

    expect(rejection).toContain('Could not resolve URL host "mcp.example.com"');
  });

  it("rejects invalid config type", async () => {
    const rejection = await validateMcpServerConfig({
      type: "invalid-type",
    });

    expect(rejection).toContain("Invalid config type");
  });

  it("rejects missing command for stdio type", async () => {
    const rejection = await validateMcpServerConfig({
      type: "stdio",
    });

    expect(rejection).toBe("Command is required for stdio servers");
  });

  it("rejects missing URL for remote server type", async () => {
    const rejection = await validateMcpServerConfig({
      type: "streamable-http",
    });

    expect(rejection).toBe("URL is required for remote servers");
  });

  it("rejects non-array args", async () => {
    const rejection = await validateMcpServerConfig({
      type: "stdio",
      command: "npx",
      args: "not-an-array",
    });

    expect(rejection).toBe("args must be an array of strings");
  });
});

describe("resolveMcpServersRejection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dnsLookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects blocked server names", async () => {
    const rejection = await resolveMcpServersRejection({
      constructor: { type: "stdio", command: "npx" },
    });

    expect(rejection).toContain('Invalid server name: "constructor"');
  });

  it("rejects non-object server config entries", async () => {
    const rejection = await resolveMcpServersRejection({
      bad: "not-an-object",
    });

    expect(rejection).toBe('Server "bad" config must be a JSON object');
  });

  it("prefixes nested validation errors with server name", async () => {
    const rejection = await resolveMcpServersRejection({
      filesystem: { type: "stdio", command: "curl" },
    });

    expect(rejection).toContain('Server "filesystem":');
  });

  it("accepts safe server maps", async () => {
    const rejection = await resolveMcpServersRejection({
      files: {
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        env: { FOO: "bar" },
      },
      remote: {
        type: "streamable-http",
        url: "https://93.184.216.34/mcp",
      },
    });

    expect(rejection).toBeNull();
  });
});
