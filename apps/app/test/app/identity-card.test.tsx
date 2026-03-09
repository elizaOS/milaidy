import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp, mockClient } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockClient: {
    getNfaStatus: vi.fn(),
    mintNfa: vi.fn(),
    anchorLearnings: vi.fn(),
    transferNfa: vi.fn(),
    upgradeNfaLogic: vi.fn(),
    toggleNfaPause: vi.fn(),
  },
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../src/api-client", () => ({
  client: mockClient,
}));

import { IdentityCard } from "../../src/components/IdentityCard";

function createNfaStatus() {
  return {
    identity: {
      agentId: "agent-42",
      network: "bsc",
      txHash: "0xidentity",
      ownerAddress: "0x1111111111111111111111111111111111111111",
      agentURI: "https://example.com/agent.json",
      registeredAt: "2026-03-01T00:00:00.000Z",
      lastUpdatedAt: "2026-03-01T00:00:00.000Z",
    },
    nfa: {
      tokenId: "42",
      network: "bsc",
      owner: "0x1111111111111111111111111111111111111111",
      learningRoot:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      learningCount: 3,
      lastAnchoredAt: "2026-03-02T00:00:00.000Z",
      logicContract: "0x2222222222222222222222222222222222222222",
      paused: false,
      freeMint: false,
      mintTxHash: "0xmint",
    },
    onChain: {
      tokenId: "42",
      owner: "0x1111111111111111111111111111111111111111",
      balance: "1",
      active: true,
      logicContract: "0x2222222222222222222222222222222222222222",
      createdAt: 1_741_087_600,
      metadata: {
        persona: "Milady",
        experience: "learned",
        voiceHash: "0xvoice",
        animationURI: "ipfs://anim",
        vaultURI: "ipfs://vault",
        vaultHash: "0xvault",
      },
      metadataURI: "ipfs://metadata",
      freeMint: false,
    },
    contractAddress: "0x3333333333333333333333333333333333333333",
  };
}

function createAppContext(
  overrides?: Partial<{
    nfaStatus: ReturnType<typeof createNfaStatus> | null;
    nfaStatusLoading: boolean;
    nfaStatusError: string | null;
    loadNfaStatus: ReturnType<typeof vi.fn>;
  }>,
) {
  return {
    nfaStatus: createNfaStatus(),
    nfaStatusLoading: false,
    nfaStatusError: null,
    loadNfaStatus: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function findButton(
  root: TestRenderer.ReactTestInstance,
  text: string,
): TestRenderer.ReactTestInstance {
  return root.find(
    (node) =>
      node.type === "button" &&
      node.children.map((child) => String(child)).join("") === text,
  );
}

function requireTree(
  tree: TestRenderer.ReactTestRenderer | undefined,
): TestRenderer.ReactTestRenderer {
  if (!tree) {
    throw new Error("IdentityCard did not render");
  }
  return tree;
}

describe("IdentityCard", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockClient.getNfaStatus.mockReset();
    mockClient.mintNfa.mockReset();
    mockClient.anchorLearnings.mockReset();
    mockClient.transferNfa.mockReset();
    mockClient.upgradeNfaLogic.mockReset();
    mockClient.toggleNfaPause.mockReset();
  });

  it("loads NFA status through AppContext instead of the api client fetch", async () => {
    const loadNfaStatus = vi.fn().mockResolvedValue(undefined);
    mockUseApp.mockReturnValue(
      createAppContext({
        nfaStatus: null,
        nfaStatusLoading: false,
        loadNfaStatus,
      }),
    );

    await act(async () => {
      TestRenderer.create(React.createElement(IdentityCard));
    });

    expect(loadNfaStatus).toHaveBeenCalledTimes(1);
    expect(mockClient.getNfaStatus).not.toHaveBeenCalled();
  });

  it("submits transfer requests through the confirm dialog input", async () => {
    const loadNfaStatus = vi.fn().mockResolvedValue(undefined);
    mockUseApp.mockReturnValue(createAppContext({ loadNfaStatus }));
    mockClient.transferNfa.mockResolvedValue({
      success: true,
      txHash: "0xtransfer",
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(IdentityCard));
    });
    const root = requireTree(tree).root;

    await act(async () => {
      findButton(root, "···").props.onClick();
    });

    await act(async () => {
      findButton(root, "Transfer").props.onClick();
    });

    const input = root.find(
      (node) =>
        node.type === "input" &&
        node.props["aria-label"] === "Recipient address",
    );

    await act(async () => {
      input.props.onChange({
        target: { value: " 0x4444444444444444444444444444444444444444 " },
      });
    });

    await act(async () => {
      findButton(root, "Confirm").props.onClick();
    });

    expect(mockClient.transferNfa).toHaveBeenCalledWith({
      to: "0x4444444444444444444444444444444444444444",
      useWalletKey: true,
    });
    expect(loadNfaStatus).toHaveBeenCalledTimes(1);
  });

  it("validates and submits logic upgrades with newLogicAddress", async () => {
    mockUseApp.mockReturnValue(createAppContext());
    mockClient.upgradeNfaLogic.mockResolvedValue({
      success: true,
      txHash: "0xupgrade",
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(IdentityCard));
    });
    const root = requireTree(tree).root;

    await act(async () => {
      findButton(root, "···").props.onClick();
    });

    await act(async () => {
      findButton(root, "Upgrade Logic").props.onClick();
    });

    await act(async () => {
      findButton(root, "Confirm").props.onClick();
    });

    expect(mockClient.upgradeNfaLogic).not.toHaveBeenCalled();
    const errorText = root
      .findAll((node) => node.props.role === "alert")
      .map((node) => node.children.join(""))
      .join("\n");
    expect(errorText).toContain("New logic contract is required.");

    const input = root.find(
      (node) =>
        node.type === "input" &&
        node.props["aria-label"] === "New logic contract",
    );

    await act(async () => {
      input.props.onChange({
        target: { value: "0x5555555555555555555555555555555555555555" },
      });
    });

    await act(async () => {
      findButton(root, "Confirm").props.onClick();
    });

    expect(mockClient.upgradeNfaLogic).toHaveBeenCalledWith({
      newLogicAddress: "0x5555555555555555555555555555555555555555",
      useWalletKey: true,
    });
  });
});
