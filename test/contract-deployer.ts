/**
 * Contract deployment fixture for e2e testing.
 *
 * Deploys MockMiladyAgentRegistry (ERC-8004) and MockMiladyCollection (ERC-8041)
 * to the local Anvil instance.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CompiledContract {
  abi: ethers.InterfaceAbi;
  bytecode: string;
}

function loadCompiledContract(contractName: string): CompiledContract {
  const artifactPath = path.join(
    __dirname,
    "contracts",
    "out",
    `${contractName}.sol`,
    `${contractName}.json`,
  );

  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `Contract artifact not found: ${artifactPath}. Did you run 'forge build' in test/contracts?`,
    );
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  return {
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
  };
}

export interface DeployedContracts {
  registry: {
    address: string;
    contract: ethers.Contract;
    abi: ethers.InterfaceAbi;
  };
  collection: {
    address: string;
    contract: ethers.Contract;
    abi: ethers.InterfaceAbi;
  };
}

/**
 * Deploy MockMiladyAgentRegistry and MockMiladyCollection to the provided network.
 *
 * @param wallet - An ethers Wallet connected to a provider
 * @returns Deployed contract addresses and instances
 */
export async function deployContracts(
  wallet: ethers.Wallet,
): Promise<DeployedContracts> {
  // Load compiled artifacts
  const registryArtifact = loadCompiledContract("MockMiladyAgentRegistry");
  const collectionArtifact = loadCompiledContract("MockMiladyCollection");

  // Get current nonce explicitly to avoid race conditions
  let currentNonce = await wallet.getNonce("pending");

  // Deploy Registry with explicit nonce
  const registryFactory = new ethers.ContractFactory(
    registryArtifact.abi,
    registryArtifact.bytecode,
    wallet,
  );
  const registryContract = await registryFactory.deploy({
    nonce: currentNonce,
  });
  await registryContract.waitForDeployment();
  const registryAddress = await registryContract.getAddress();
  currentNonce++;

  // Deploy Collection with explicit nonce
  const collectionFactory = new ethers.ContractFactory(
    collectionArtifact.abi,
    collectionArtifact.bytecode,
    wallet,
  );
  const collectionContract = await collectionFactory.deploy({
    nonce: currentNonce,
  });
  await collectionContract.waitForDeployment();
  const collectionAddress = await collectionContract.getAddress();

  return {
    registry: {
      address: registryAddress,
      contract: registryContract as ethers.Contract,
      abi: registryArtifact.abi,
    },
    collection: {
      address: collectionAddress,
      contract: collectionContract as ethers.Contract,
      abi: collectionArtifact.abi,
    },
  };
}

/**
 * Get the compiled ABIs for use with existing service classes.
 */
export function getContractABIs(): {
  registryABI: ethers.InterfaceAbi;
  collectionABI: ethers.InterfaceAbi;
} {
  const registryArtifact = loadCompiledContract("MockMiladyAgentRegistry");
  const collectionArtifact = loadCompiledContract("MockMiladyCollection");

  return {
    registryABI: registryArtifact.abi,
    collectionABI: collectionArtifact.abi,
  };
}
