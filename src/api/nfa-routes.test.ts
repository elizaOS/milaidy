import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { handleNfaRoutes } from "./nfa-routes.js";

// ── fs/os mocks ────────────────────────────────────────────────────────────

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/mock-home"),
}));

import { readFile } from "node:fs/promises";

const mockReadFile = vi.mocked(readFile);

// ── helpers ────────────────────────────────────────────────────────────────

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

type InvokeResult = {
  handled: boolean;
  status: number;
  payload: unknown;
};

async function invoke(method: string, pathname: string): Promise<InvokeResult> {
  let status = 200;
  let payload: unknown = null;

  const handled = await handleNfaRoutes({
    req: {} as IncomingMessage,
    res: {} as ServerResponse,
    method,
    pathname,
    json: (_res, data, code = 200) => {
      status = code;
      payload = data;
    },
    error: (_res, message, code = 400) => {
      status = code;
      payload = { error: message };
    },
  });

  return { handled, status, payload };
}

// ── fixtures ───────────────────────────────────────────────────────────────

const NFA_RECORD = {
  tokenId: "42",
  contractAddress: "0xdeadbeef",
  network: "bsc-testnet",
  ownerAddress: "0xowner",
  mintTxHash: "0xmint",
  merkleRoot: "0xroot",
  mintedAt: "2025-01-01T00:00:00.000Z",
  lastUpdatedAt: "2025-01-02T00:00:00.000Z",
};

const IDENTITY_RECORD = {
  agentId: "7",
  network: "bsc-testnet",
  txHash: "0xidentitytx",
  ownerAddress: "0xowner",
  agentURI: "https://example.com/agent",
  registeredAt: "2025-01-01T00:00:00.000Z",
  lastUpdatedAt: "2025-01-01T00:00:00.000Z",
};

// No preamble — start directly with dated sections to get exactly 2 entries.
const LEARNINGS_MD = `## 2025-01-01
Learned about BNB Chain.

## 2025-01-02
Learned about Merkle trees.
`;

// ── GET /api/nfa/status ────────────────────────────────────────────────────

describe("GET /api/nfa/status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test("returns { nfa: null, identity: null, configured: false } when no JSON files exist", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const { handled, status, payload } = await invoke("GET", "/api/nfa/status");

    expect(handled).toBe(true);
    expect(status).toBe(200);
    expect(payload).toEqual({ nfa: null, identity: null, configured: false });
  });

  test("returns composed shape when both JSON files are present", async () => {
    mockReadFile.mockImplementation(async (path) => {
      const p = String(path);
      if (p.endsWith("bap578-nfa.json")) return JSON.stringify(NFA_RECORD);
      if (p.endsWith("bnb-identity.json"))
        return JSON.stringify(IDENTITY_RECORD);
      throw new Error("ENOENT");
    });

    const { handled, status, payload } = await invoke("GET", "/api/nfa/status");

    expect(handled).toBe(true);
    expect(status).toBe(200);
    const data = payload as Record<string, unknown>;
    expect(data.configured).toBe(true);

    // NFA shape
    const nfa = data.nfa as Record<string, unknown>;
    expect(nfa.tokenId).toBe("42");
    expect(nfa.network).toBe("bsc-testnet");
    expect(nfa.bscscanUrl).toBe("https://testnet.bscscan.com/tx/0xmint");

    // Identity shape
    const identity = data.identity as Record<string, unknown>;
    expect(identity.agentId).toBe("7");
    expect(identity.scanUrl).toMatch(/testnet\.8004scan\.io\/agent\/7/);
  });

  test("returns mainnet bscscan URL when network is bsc", async () => {
    mockReadFile.mockImplementation(async (path) => {
      const p = String(path);
      if (p.endsWith("bap578-nfa.json"))
        return JSON.stringify({ ...NFA_RECORD, network: "bsc" });
      throw new Error("ENOENT");
    });

    const { payload } = await invoke("GET", "/api/nfa/status");
    const nfa = (payload as Record<string, unknown>).nfa as Record<
      string,
      unknown
    >;
    expect(nfa.bscscanUrl).toBe("https://bscscan.com/tx/0xmint");
  });

  test("ignores non-matching routes", async () => {
    const { handled } = await invoke("GET", "/api/nfa/other");
    expect(handled).toBe(false);
  });
});

// ── GET /api/nfa/learnings ─────────────────────────────────────────────────

describe("GET /api/nfa/learnings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test("returns empty entries and sha256('') root when no LEARNINGS.md", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const { handled, status, payload } = await invoke(
      "GET",
      "/api/nfa/learnings",
    );

    expect(handled).toBe(true);
    expect(status).toBe(200);
    expect(payload).toEqual({
      entries: [],
      merkleRoot: sha256Hex(""),
      totalEntries: 0,
      source: null,
    });
  });

  test("returns parsed entries with correct Merkle root for known markdown", async () => {
    mockReadFile.mockImplementation(async (path) => {
      const p = String(path);
      if (p.includes("LEARNINGS.md")) return LEARNINGS_MD;
      throw new Error("ENOENT");
    });

    const { handled, status, payload } = await invoke(
      "GET",
      "/api/nfa/learnings",
    );

    expect(handled).toBe(true);
    expect(status).toBe(200);

    const data = payload as {
      entries: Array<{ date: string; content: string; hash: string }>;
      merkleRoot: string;
      totalEntries: number;
      source: string | null;
    };

    expect(data.totalEntries).toBe(2);
    expect(data.source).toMatch(/LEARNINGS\.md$/);
    expect(data.entries[0].date).toBe("2025-01-01");
    expect(data.entries[1].date).toBe("2025-01-02");

    // Each entry hash must be sha256 of its content
    for (const entry of data.entries) {
      expect(entry.hash).toBe(sha256Hex(entry.content));
    }

    // Merkle root must be deterministically derived from the leaf hashes
    const leafHashes = data.entries.map((e) => e.hash);
    const [a, b] =
      leafHashes[0] < leafHashes[1]
        ? [leafHashes[0], leafHashes[1]]
        : [leafHashes[1], leafHashes[0]];
    const expectedRoot = sha256Hex(a + b);
    expect(data.merkleRoot).toBe(expectedRoot);
  });

  test("ignores non-matching routes", async () => {
    const { handled } = await invoke("GET", "/api/nfa/other");
    expect(handled).toBe(false);
  });
});
