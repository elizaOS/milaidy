#!/usr/bin/env node
/**
 * Create a Farcaster developer-managed signer (Ed25519 key pair)
 * and register it on-chain via the KeyGateway contract on Optimism.
 *
 * Prerequisites:
 *   - Your Farcaster FID
 *   - The private key of the ETH address that owns your FID (custody address)
 *     → In Warpcast: Settings > Advanced > Reveal recovery phrase
 *     → Then derive the private key from the mnemonic
 *   - A small amount of ETH on Optimism for gas (~$0.01)
 *
 * Usage:
 *   bun scripts/create-farcaster-signer.mjs \
 *     --fid 12345 \
 *     --custody-key 0xYOUR_PRIVATE_KEY
 *
 * Or via env vars:
 *   FARCASTER_FID=12345 \
 *   FARCASTER_CUSTODY_KEY=0x... \
 *   bun scripts/create-farcaster-signer.mjs
 *
 * Output: prints the signer private key (hex) and public key.
 */

import { ed25519 } from "@noble/curves/ed25519";
import { randomBytes } from "node:crypto";
import { ethers } from "ethers";

// ── Farcaster contract addresses on Optimism ──
const KEY_GATEWAY = "0x00000000fC56947c7E7183f8Ca4B62398CaAdf0B";
const SIGNED_KEY_REQUEST_VALIDATOR =
  "0x00000000FC700472606ED4fA22623Acf62c60553";

// ── ABI fragment ──
const KEY_GATEWAY_ABI = [
  "function add(uint32 keyType, bytes calldata key, uint8 metadataType, bytes calldata metadata)",
];

// ── Parse args ──
function parseArgs() {
  const args = process.argv.slice(2);
  let fid = process.env.FARCASTER_FID;
  let custodyKey = process.env.FARCASTER_CUSTODY_KEY;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--fid" && args[i + 1]) fid = args[++i];
    if (args[i] === "--custody-key" && args[i + 1]) custodyKey = args[++i];
  }

  if (!fid || !custodyKey) {
    console.error(
      "Usage: bun scripts/create-farcaster-signer.mjs --fid <FID> --custody-key <0xPRIVATE_KEY>\n" +
        "Or set FARCASTER_FID and FARCASTER_CUSTODY_KEY env vars.",
    );
    process.exit(1);
  }

  if (!custodyKey.startsWith("0x")) custodyKey = `0x${custodyKey}`;

  return { fid: BigInt(fid), custodyKey };
}

async function main() {
  const { fid, custodyKey } = parseArgs();

  // 1. Generate Ed25519 key pair
  console.log("Generating Ed25519 signer key pair...");
  const signerPrivateKey = randomBytes(32);
  const signerPublicKey = ed25519.getPublicKey(signerPrivateKey);

  const signerPrivHex = `0x${Buffer.from(signerPrivateKey).toString("hex")}`;
  const signerPubHex = `0x${Buffer.from(signerPublicKey).toString("hex")}`;

  console.log(`  Signer private key: ${signerPrivHex}`);
  console.log(`  Signer public key:  ${signerPubHex}`);

  // 2. Set up ethers provider & wallet
  const provider = new ethers.JsonRpcProvider("https://mainnet.optimism.io");
  const wallet = new ethers.Wallet(custodyKey, provider);

  console.log(`\nCustody address: ${wallet.address}`);
  console.log(`FID: ${fid}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance on Optimism: ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    console.error(
      "\nERROR: No ETH on Optimism. Send ~$0.01 ETH to your custody address on Optimism first.",
    );
    process.exit(1);
  }

  // 3. Sign EIP-712 SignedKeyRequest
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400); // 24h

  const domain = {
    name: "Farcaster SignedKeyRequestValidator",
    version: "1",
    chainId: 10,
    verifyingContract: SIGNED_KEY_REQUEST_VALIDATOR,
  };

  const types = {
    SignedKeyRequest: [
      { name: "requestFid", type: "uint256" },
      { name: "key", type: "bytes" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const message = {
    requestFid: fid,
    key: signerPubHex,
    deadline,
  };

  console.log("\nSigning EIP-712 SignedKeyRequest...");
  const signature = await wallet.signTypedData(domain, types, message);
  console.log("  Signature obtained.");

  // 4. ABI-encode metadata struct
  const metadataEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(uint256 requestFid, address requestSigner, bytes signature, uint256 deadline)"],
    [
      {
        requestFid: fid,
        requestSigner: wallet.address,
        signature,
        deadline,
      },
    ],
  );

  // 5. Submit on-chain transaction
  console.log("Submitting KeyGateway.add() transaction on Optimism...");
  const keyGateway = new ethers.Contract(KEY_GATEWAY, KEY_GATEWAY_ABI, wallet);

  const tx = await keyGateway.add(
    1, // keyType: Ed25519
    signerPubHex, // key: 32-byte Ed25519 public key
    1, // metadataType: SignedKeyRequest
    metadataEncoded,
  );

  console.log(`  Transaction hash: ${tx.hash}`);
  console.log("  Waiting for confirmation...");

  const receipt = await tx.wait();

  if (receipt.status === 1) {
    console.log(`  Confirmed in block ${receipt.blockNumber}`);
    console.log("\n══════════════════════════════════════════════════");
    console.log("  SIGNER CREATED SUCCESSFULLY");
    console.log("══════════════════════════════════════════════════");
    console.log(`  FARCASTER_FID=${fid}`);
    console.log(`  FARCASTER_SIGNER_UUID=${signerPrivHex}`);
    console.log(`  Signer public key: ${signerPubHex}`);
    console.log("══════════════════════════════════════════════════");
    console.log("\nAdd these to your .env or pass them when running tests:");
    console.log(
      `  FARCASTER_NEYNAR_API_KEY=<YOUR_NEYNAR_API_KEY> \\`,
    );
    console.log(`  FARCASTER_SIGNER_UUID=${signerPrivHex} \\`);
    console.log(`  FARCASTER_FID=${fid} \\`);
    console.log(`  MILADY_LIVE_TEST=1 \\`);
    console.log(`  bun test test/farcaster-connector.e2e.test.ts`);
  } else {
    console.error("  Transaction FAILED:", receipt);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
