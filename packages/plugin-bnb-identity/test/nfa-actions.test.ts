import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import {
  nfaAnchorLearningsAction,
  nfaMintAction,
  nfaPauseAction,
  nfaTransferAction,
  nfaUpgradeLogicAction,
} from "../src/nfa-actions.js";
import { extractAddress, userConfirmed } from "../src/nfa-actions-shared.js";
import { BnbIdentityService } from "../src/service.js";
import { clearIdentity, clearNfa, readNfa, writeNfa } from "../src/store.js";
import type { NfaRecord } from "../src/types.js";

const TEST_PRIVATE_KEY = "test-private-key";
const TEST_OWNER_ADDRESS = `0x${"a".repeat(40)}`;
const TEST_TRANSFER_ADDRESS = `0x${"b".repeat(40)}`;
const TEST_LOGIC_ADDRESS = `0x${"c".repeat(40)}`;

const mockNfa: NfaRecord = {
  tokenId: "1",
  network: "bsc-testnet",
  owner: TEST_OWNER_ADDRESS,
  learningRoot: `0x${"0".repeat(64)}`,
  learningCount: 0,
  lastAnchoredAt: "2026-03-05T00:00:00.000Z",
  paused: false,
  mintTxHash: "0xdeadbeef",
};

const originalMintNfa = BnbIdentityService.prototype.mintNfa;
const originalUpdateLearningRoot =
  BnbIdentityService.prototype.updateLearningRoot;
const originalTransferNfa = BnbIdentityService.prototype.transferNfa;
const originalUpgradeLogic = BnbIdentityService.prototype.upgradeLogic;
const originalPauseNfa = BnbIdentityService.prototype.pauseNfa;
const originalUnpauseNfa = BnbIdentityService.prototype.unpauseNfa;

function makeRuntime(settings: Record<string, string> = {}): IAgentRuntime {
  const resolvedSettings = {
    BNB_PRIVATE_KEY: TEST_PRIVATE_KEY,
    BNB_NETWORK: "bsc-testnet",
    ...settings,
  };
  return {
    character: {
      name: "Milady",
      plugins: ["@milady/plugin-bnb-identity"],
    },
    getSetting(key: string) {
      return resolvedSettings[key];
    },
  } as IAgentRuntime;
}

function makeMemory(text: string): Memory {
  return {
    content: { text },
  } as Memory;
}

async function invokeAction(
  action: typeof nfaMintAction,
  runtime: IAgentRuntime,
  messageText: string,
  state: State = {} as State,
) {
  const responses: { text?: string }[] = [];
  await action.handler(
    runtime,
    makeMemory(messageText),
    state,
    undefined,
    async (response) => {
      responses.push(response as { text?: string });
    },
  );
  return { responses, state };
}

describe("nfa action helpers", () => {
  it("extracts 0x addresses from user text", () => {
    expect(
      extractAddress(
        "transfer nfa to 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
      ),
    ).toBe("0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18");
    expect(extractAddress("transfer nfa to alice")).toBeUndefined();
  });

  it("does not treat negated confirmations as approval", () => {
    expect(userConfirmed(makeMemory("confirm"))).toBe(true);
    expect(userConfirmed(makeMemory("yes, do it"))).toBe(true);
    expect(userConfirmed(makeMemory("do not confirm"))).toBe(false);
    expect(userConfirmed(makeMemory("no confirm"))).toBe(false);
  });
});

describe("nfa action handlers", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = mkdtempSync(join(tmpdir(), "milady-nfa-actions-"));
    await clearIdentity();
    await clearNfa();

    BnbIdentityService.prototype.mintNfa = async () => ({
      tokenId: "42",
      txHash: "0xtx",
      owner: TEST_OWNER_ADDRESS,
      network: "bsc-testnet",
      freeMint: false,
    });
    BnbIdentityService.prototype.updateLearningRoot = async () => ({
      txHash: "0xanchor",
      previousRoot: `0x${"0".repeat(64)}`,
      newRoot: `0x${"a".repeat(64)}`,
      network: "bsc-testnet",
    });
    BnbIdentityService.prototype.transferNfa = async () => ({
      txHash: "0xtransfer",
      network: "bsc-testnet",
    });
    BnbIdentityService.prototype.upgradeLogic = async () => ({
      txHash: "0xupgrade",
      previousLogic: `0x${"d".repeat(40)}`,
      newLogic: TEST_LOGIC_ADDRESS,
      network: "bsc-testnet",
    });
    BnbIdentityService.prototype.pauseNfa = async () => ({
      txHash: "0xpause",
      paused: true,
      network: "bsc-testnet",
    });
    BnbIdentityService.prototype.unpauseNfa = async () => ({
      txHash: "0xunpause",
      paused: false,
      network: "bsc-testnet",
    });
  });

  afterEach(async () => {
    BnbIdentityService.prototype.mintNfa = originalMintNfa;
    BnbIdentityService.prototype.updateLearningRoot =
      originalUpdateLearningRoot;
    BnbIdentityService.prototype.transferNfa = originalTransferNfa;
    BnbIdentityService.prototype.upgradeLogic = originalUpgradeLogic;
    BnbIdentityService.prototype.pauseNfa = originalPauseNfa;
    BnbIdentityService.prototype.unpauseNfa = originalUnpauseNfa;
    await clearIdentity();
    await clearNfa();
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("stores a pending mint confirmation and completes minting on confirm", async () => {
    const runtime = makeRuntime({
      MILADY_WORKSPACE_DIR: workspaceDir,
      BNB_NETWORK: "bsc-testnet",
    });
    const state = {} as State;

    const first = await invokeAction(nfaMintAction, runtime, "mint nfa", state);
    expect(first.responses[0]?.text).toContain("Reply **confirm** to proceed");
    expect(
      (state as Record<string, unknown>).bnb_nfa_mint_pending,
    ).toBeDefined();

    const second = await invokeAction(nfaMintAction, runtime, "confirm", state);
    expect(second.responses.at(-1)?.text).toContain("NFA minted successfully");
    expect(await readNfa()).toMatchObject({ tokenId: "42" });
  });

  it("refuses to mint when an NFA already exists", async () => {
    await writeNfa(mockNfa);
    const runtime = makeRuntime({ MILADY_WORKSPACE_DIR: workspaceDir });

    const { responses } = await invokeAction(
      nfaMintAction,
      runtime,
      "mint nfa",
    );

    expect(responses[0]?.text).toContain("already has an NFA");
  });

  it("anchors learnings from LEARNINGS.md", async () => {
    await writeNfa(mockNfa);
    writeFileSync(
      join(workspaceDir, "LEARNINGS.md"),
      [
        "id: learn-1",
        "timestamp: 2026-01-01T00:00:00.000Z",
        "category: insight",
        "summary: Learned something useful",
        "detail: This came from the action flow.",
      ].join("\n"),
      "utf8",
    );
    const runtime = makeRuntime({ MILADY_WORKSPACE_DIR: workspaceDir });

    const { responses } = await invokeAction(
      nfaAnchorLearningsAction,
      runtime,
      "anchor learnings",
    );

    expect(responses.at(-1)?.text).toContain(
      "Learning root anchored successfully",
    );
  });

  it("cancels transfer when the reply negates confirmation", async () => {
    await writeNfa(mockNfa);
    const runtime = makeRuntime({ MILADY_WORKSPACE_DIR: workspaceDir });
    const state = {} as State;

    const first = await invokeAction(
      nfaTransferAction,
      runtime,
      `transfer nfa to ${TEST_TRANSFER_ADDRESS}`,
      state,
    );
    expect(first.responses[0]?.text).toContain("IRREVERSIBLE");
    expect(
      (state as Record<string, unknown>).bnb_nfa_transfer_pending,
    ).toBeDefined();

    const second = await invokeAction(
      nfaTransferAction,
      runtime,
      "do not confirm",
      state,
    );
    expect(second.responses.at(-1)?.text).toContain("NFA transfer cancelled");
    expect(
      (state as Record<string, unknown>).bnb_nfa_transfer_pending,
    ).toBeUndefined();
  });

  it("transfers after confirmation using the stored pending address", async () => {
    await writeNfa(mockNfa);
    const runtime = makeRuntime({ MILADY_WORKSPACE_DIR: workspaceDir });
    const state = {} as State;

    await invokeAction(
      nfaTransferAction,
      runtime,
      `transfer nfa to ${TEST_TRANSFER_ADDRESS}`,
      state,
    );
    const result = await invokeAction(
      nfaTransferAction,
      runtime,
      "confirm",
      state,
    );

    expect(result.responses.at(-1)?.text).toContain(
      "NFA transferred successfully",
    );
    expect((await readNfa())?.owner).toBe(TEST_TRANSFER_ADDRESS);
  });

  it("upgrades logic after confirmation", async () => {
    await writeNfa(mockNfa);
    const runtime = makeRuntime({ MILADY_WORKSPACE_DIR: workspaceDir });
    const state = {} as State;

    await invokeAction(
      nfaUpgradeLogicAction,
      runtime,
      `upgrade nfa logic to ${TEST_LOGIC_ADDRESS}`,
      state,
    );
    const result = await invokeAction(
      nfaUpgradeLogicAction,
      runtime,
      "confirm",
      state,
    );

    expect(result.responses.at(-1)?.text).toContain(
      "NFA logic upgraded successfully",
    );
  });

  it("returns early when the NFA is already paused", async () => {
    await writeNfa({ ...mockNfa, paused: true });
    const runtime = makeRuntime({ MILADY_WORKSPACE_DIR: workspaceDir });

    const { responses } = await invokeAction(
      nfaPauseAction,
      runtime,
      "pause nfa",
    );

    expect(responses[0]?.text).toContain("already paused");
  });
});
