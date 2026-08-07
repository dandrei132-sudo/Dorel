import { randomBytes } from "node:crypto";
import type { Wallet } from "ethers";

export interface SiweMessageParams {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  chainId: number;
  nonce: string;
}

/**
 * Builds an EIP-4361 (Sign-In With Ethereum) message. Minimal hand-rolled
 * builder (no external siwe dependency) since we only need to produce and
 * sign the message, not run a full verifying relying-party.
 */
export function buildSiweMessage(params: SiweMessageParams): string {
  const issuedAt = new Date().toISOString();
  return [
    `${params.domain} wants you to sign in with your Ethereum account:`,
    params.address,
    "",
    params.statement,
    "",
    `URI: ${params.uri}`,
    "Version: 1",
    `Chain ID: ${params.chainId}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export interface SignedSiwe {
  message: string;
  signature: string;
  address: string;
}

export async function signSiweMessage(
  wallet: Wallet,
  params: SiweMessageParams,
): Promise<SignedSiwe> {
  const message = buildSiweMessage(params);
  const signature = await wallet.signMessage(message);
  return { message, signature, address: wallet.address };
}

export function generateNonce(): string {
  return randomBytes(16).toString("hex");
}
