import { JsonRpcProvider, Wallet, formatEther, parseEther, type TransactionResponse } from "ethers";
import { env, BASE_SEPOLIA_CHAIN_ID } from "../config.js";

let provider: JsonRpcProvider | null = null;

/**
 * Real read/write access to Base Sepolia — a public, valueless testnet.
 * This is deliberately never pointed at mainnet: BASE_SEPOLIA_RPC_URL
 * defaults to the public Base Sepolia RPC, and nothing in this codebase
 * overrides that to a mainnet chain ID.
 */
export function getProvider(): JsonRpcProvider {
  if (provider) return provider;
  provider = new JsonRpcProvider(env.BASE_SEPOLIA_RPC_URL, BASE_SEPOLIA_CHAIN_ID);
  return provider;
}

export async function getBalanceEth(address: string): Promise<string> {
  const balance = await getProvider().getBalance(address);
  return formatEther(balance);
}

export interface TransferResult {
  txHash: string;
  amountEth: string;
  to: string;
}

/**
 * Sends a real transaction on Base Sepolia testnet. Requires the sending
 * wallet to actually hold testnet ETH (obtained by the human operator from
 * a faucet) — there is no path in this codebase that fabricates balance or
 * touches mainnet.
 */
export async function sendEth(
  signer: Wallet,
  toAddress: string,
  amountEth: string,
): Promise<TransferResult> {
  const connected = signer.connect(getProvider());
  const tx: TransactionResponse = await connected.sendTransaction({
    to: toAddress,
    value: parseEther(amountEth),
  });
  await tx.wait();
  return { txHash: tx.hash, amountEth, to: toAddress };
}
