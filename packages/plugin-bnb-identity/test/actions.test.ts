import { describe, expect, it } from "bun:test";
import {
  extractAgentIdFromText,
  normalizeBnbNetwork,
} from "../src/actions.js";

describe("normalizeBnbNetwork", () => {
  it("keeps supported networks unchanged", () => {
    expect(normalizeBnbNetwork("bsc")).toEqual({
      network: "bsc",
    });
    expect(normalizeBnbNetwork("bsc-testnet")).toEqual({
      network: "bsc-testnet",
    });
  });

  it("normalizes common mainnet aliases", () => {
    expect(normalizeBnbNetwork("mainnet")).toEqual({
      network: "bsc",
      warning: 'Normalized BNB_NETWORK "mainnet" to "bsc" for compatibility.',
    });
    expect(normalizeBnbNetwork("BNB")).toEqual({
      network: "bsc",
      warning: 'Normalized BNB_NETWORK "BNB" to "bsc" for compatibility.',
    });
  });

  it("normalizes common testnet aliases", () => {
    expect(normalizeBnbNetwork("testnet")).toEqual({
      network: "bsc-testnet",
      warning: 'Normalized BNB_NETWORK "testnet" to "bsc-testnet" for compatibility.',
    });
    expect(normalizeBnbNetwork("bnb_testnet")).toEqual({
      network: "bsc-testnet",
      warning: 'Normalized BNB_NETWORK "bnb_testnet" to "bsc-testnet" for compatibility.',
    });
  });

  it("rejects unsupported networks", () => {
    expect(() => normalizeBnbNetwork("polygon")).toThrow(
      'Unsupported BNB_NETWORK "polygon". Supported values: bsc, bsc-testnet.'
    );
  });
});

describe("extractAgentIdFromText", () => {
  it("extracts numeric agent ids from common request formats", () => {
    expect(extractAgentIdFromText("look up agent 42")).toBe("42");
    expect(extractAgentIdFromText("Resolve agent ID: 99")).toBe("99");
    expect(extractAgentIdFromText("agentid is 7")).toBe("7");
    expect(extractAgentIdFromText("agent 77")).toBe("77");
    expect(extractAgentIdFromText("my agent id")).toBeUndefined();
  });

  it("extracts only the first matching number", () => {
    expect(extractAgentIdFromText("agent 1 and agent 2")).toBe("1");
  });
});
