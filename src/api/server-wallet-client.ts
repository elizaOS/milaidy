import { Wallet } from "ethers";
import { logger } from "@elizaos/core";

export interface ProvisionServerWalletOptions {
    apiUrl: string;
    apiKey: string;
    chainType: "evm" | "solana";
    clientAddress: string;
    characterId?: string;
}

/**
 * Generate an Auth Keypair (EVM secp256k1 format) to use exclusively
 * for authenticating RPC requests to the Eliza Cloud server wallet.
 */
export function generateAuthKeypair(): { privateKey: string; address: string } {
    const wallet = Wallet.createRandom();
    return {
        privateKey: wallet.privateKey,
        address: wallet.address,
    };
}

/**
 * Calls Eliza Cloud to provision a new Privy Server Wallet
 * secured by the agent's client auth public key.
 */
export async function provisionServerWallet({
    apiUrl,
    apiKey,
    chainType,
    clientAddress,
    characterId,
}: ProvisionServerWalletOptions) {
    const res = await fetch(`${apiUrl}/api/v1/user/wallets/provision`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ chainType, clientAddress, characterId }),
    });

    if (!res.ok) {
        const err = await res.text();
        logger.error(`[ServerWallet] Provision error: ${err}`);
        throw new Error(`Failed to provision server wallet: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data?.success) {
        throw new Error(data?.error || "Unknown provisioning error");
    }

    return data.data; // { id, address, chainType, clientAddress }
}

export interface ExecuteParams {
    apiUrl: string;
    clientPrivateKey: string;
    method: string;
    params: any[];
}

/**
 * Sign and send an RPC request to the Eliza Cloud proxy endpoint.
 * The payload is signed with the local Auth Key.
 */
export async function executeServerWalletRpc({
    apiUrl,
    clientPrivateKey,
    method,
    params,
}: ExecuteParams) {
    const wallet = new Wallet(clientPrivateKey);
    const payload = { method, params };

    // Sign standard EIP-191 personal message
    const signature = await wallet.signMessage(JSON.stringify(payload));

    const res = await fetch(`${apiUrl}/api/v1/user/wallets/rpc`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            clientAddress: wallet.address,
            payload,
            signature,
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        logger.error(`[ServerWallet] RPC execution error: ${err}`);
        throw new Error(`Failed to execute server wallet RPC: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data?.success) {
        throw new Error(data?.error || "Unknown RPC error");
    }

    return data.data;
}
