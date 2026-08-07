import { Contract, type Wallet } from "ethers";
import { env } from "../config.js";
import { getProvider } from "../identity/provider.js";

// Minimal surface of an ERC-8004-style identity registry: register an
// agent's on-chain identity against a URI pointing at its agent card.
// This is intentionally small — we only call the one method we need.
const REGISTRY_ABI = [
  "function register(string agentCardUri) returns (uint256 agentId)",
  "function resolve(address agentAddress) view returns (uint256 agentId)",
];

export interface RegistrationResult {
  registered: boolean;
  reason?: string;
  txHash?: string;
  agentId?: string;
}

/**
 * Registers the agent's on-chain identity, but only if the caller has
 * configured a real, deployed registry contract address via
 * ERC8004_REGISTRY_ADDRESS. We deliberately do not guess or hard-code an
 * address — sending a transaction to a fabricated "registry" would either
 * silently no-op against an unrelated contract or burn testnet gas for
 * nothing, and either way misrepresents what actually happened on-chain.
 */
export async function registerOnChainIdentity(
  wallet: Wallet,
  agentCardUri: string,
): Promise<RegistrationResult> {
  if (!env.ERC8004_REGISTRY_ADDRESS) {
    return {
      registered: false,
      reason:
        "ERC8004_REGISTRY_ADDRESS is not configured; skipping on-chain registration rather than guessing a contract address.",
    };
  }

  const contract = new Contract(
    env.ERC8004_REGISTRY_ADDRESS,
    REGISTRY_ABI,
    wallet.connect(getProvider()),
  );

  const tx = await contract.register(agentCardUri);
  const receipt = await tx.wait();

  return {
    registered: true,
    txHash: receipt?.hash ?? tx.hash,
  };
}
