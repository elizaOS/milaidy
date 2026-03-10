import {
  BnbIdentityService,
  readIdentity,
} from "../../packages/plugin-bnb-identity/src/index";
import type {
  IdentityRecord,
  LearningLeaf,
  NfaInfo,
} from "../../packages/plugin-bnb-identity/src/types";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";

export interface NfaRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "json" | "error"> {
  nfaContractAddress?: string;
  workspaceDir: string;
  readJsonBody: () => Promise<Record<string, unknown> | null>;
}

export interface NfaStatusResponse {
  identity: IdentityRecord | null;
  nfa: import("../../packages/plugin-bnb-identity/src/types").NfaRecord | null;
  onChain: NfaInfo | null;
  contractAddress: string | null;
}

export interface NfaLearningsResponse {
  entries: LearningLeaf[];
  root: string;
  count: number;
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const VAULT_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

export function resolvePrivateKey(body: Record<string, unknown>): string {
  if (body.useWalletKey) {
    const key = process.env.EVM_PRIVATE_KEY;
    if (!key) throw new Error("EVM_PRIVATE_KEY not set");
    return key;
  }
  const key = process.env.BNB_PRIVATE_KEY;
  if (!key) throw new Error("BNB_PRIVATE_KEY not set");
  return key;
}

export function buildService(
  privateKey: string,
  nfaContractAddress: string | undefined,
  network?: string,
): BnbIdentityService {
  return new BnbIdentityService(null, {
    privateKey,
    network: network || "bsc",
    gatewayPort: 0,
    nfaContractAddress,
    rpcUrl: resolveNfaRpcUrl(),
  });
}

export function resolveNfaRpcUrl(): string | undefined {
  const rpcUrl =
    process.env.BSC_RPC_URL?.trim() || process.env.BNB_RPC_URL?.trim();
  return rpcUrl || undefined;
}

export function readRequiredAddress(
  body: Record<string, unknown>,
  key: string,
): { value: string } | { error: string } {
  const raw = body[key];
  if (typeof raw !== "string" || !raw.trim()) {
    return { error: `Missing required field: ${key}` };
  }

  const value = raw.trim();
  if (!ADDRESS_RE.test(value)) {
    return { error: `${key} must be a 0x-prefixed 40-byte hex address.` };
  }

  return { value };
}

function readOptionalString(
  body: Record<string, unknown>,
  key: string,
  maxLength: number,
): { value: string } | { error: string } {
  const raw = body[key];
  if (raw === undefined || raw === null) {
    return { value: "" };
  }

  if (typeof raw !== "string") {
    return { error: `${key} must be a string.` };
  }

  const value = raw.trim();
  if (value.length > maxLength) {
    return { error: `${key} must be at most ${maxLength} characters.` };
  }

  return { value };
}

export function validateMintOptions(body: Record<string, unknown>):
  | {
      persona: string;
      experience: string;
      voiceHash: string;
      animationURI: string;
      vaultURI: string;
      vaultHash: string;
    }
  | { error: string } {
  const persona = readOptionalString(body, "persona", 280);
  if ("error" in persona) return persona;

  const experience = readOptionalString(body, "experience", 500);
  if ("error" in experience) return experience;

  const voiceHash = readOptionalString(body, "voiceHash", 128);
  if ("error" in voiceHash) return voiceHash;

  const animationURI = readOptionalString(body, "animationURI", 2048);
  if ("error" in animationURI) return animationURI;

  const vaultURI = readOptionalString(body, "vaultURI", 2048);
  if ("error" in vaultURI) return vaultURI;

  const vaultHash = readOptionalString(body, "vaultHash", 66);
  if ("error" in vaultHash) return vaultHash;
  if (vaultHash.value && !VAULT_HASH_RE.test(vaultHash.value)) {
    return { error: "vaultHash must be a 0x-prefixed 32-byte hex string." };
  }

  return {
    persona: persona.value,
    experience: experience.value,
    voiceHash: voiceHash.value,
    animationURI: animationURI.value,
    vaultURI: vaultURI.value,
    vaultHash: vaultHash.value || `0x${"0".repeat(64)}`,
  };
}

export function getNfaContractAddressError(
  nfaContractAddress: string | undefined,
): string | null {
  if (typeof nfaContractAddress === "string" && nfaContractAddress.trim()) {
    return null;
  }
  return (
    "BAP578_CONTRACT_ADDRESS is not configured. " +
    "Set env.BAP578_CONTRACT_ADDRESS in ~/.milady/milady.json and restart Milady."
  );
}

export async function resolveAgentUri(
  body: Record<string, unknown>,
): Promise<string> {
  const requestUri =
    typeof body.agentURI === "string" ? body.agentURI.trim() : "";
  if (requestUri) return requestUri;

  const identity = await readIdentity();
  const storedUri = identity?.agentURI?.trim();
  if (storedUri) return storedUri;

  const fallbackMetadata = {
    name: "Milady",
    description:
      "Milady local AI agent metadata used as fallback URI for BAP-578 minting.",
    version: "0.1.0",
    created: new Date().toISOString(),
    services: [],
    capabilities: ["local-execution", "privacy-preserving"],
    platforms: ["webchat"],
  };
  const encoded = Buffer.from(
    JSON.stringify(fallbackMetadata),
    "utf8",
  ).toString("base64");
  return `data:application/json;base64,${encoded}`;
}
