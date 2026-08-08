import { randomUUID } from "node:crypto";
import { Wallet } from "ethers";
import type { ConwayClient } from "../conway/types.js";
import { sendEth } from "../identity/provider.js";
import { recordChild, type LineageRecord } from "./lineage.js";

export interface SpawnRequest {
  name: string;
  genesisPrompt: string;
  fundingCredits: number;
  fundingEth?: string;
  parentId: string;
  parentGeneration: number;
  parentWallet: Wallet;
}

export interface SpawnResult {
  sandboxId: string;
  child: LineageRecord;
}

/**
 * Replicates the agent: asks the ConwayClient to provision a new sandbox,
 * generates the child's own wallet identity, optionally sends it real
 * testnet ETH from the parent's wallet (a genuine transfer, not simulated),
 * and records the parent/child relationship in the lineage table. The
 * child is sovereign from creation: its own wallet, its own genesis
 * prompt, its own survival pressure.
 */
export async function spawnChild(
  conway: ConwayClient,
  req: SpawnRequest,
): Promise<SpawnResult> {
  const { sandboxId } = await conway.spawnSandbox({
    name: req.name,
    genesisPrompt: req.genesisPrompt,
    fundingCredits: req.fundingCredits,
  });

  const childWallet = Wallet.createRandom();
  const childId = randomUUID();

  let fundedTxHash: string | undefined;
  if (req.fundingEth) {
    const transfer = await sendEth(
      req.parentWallet,
      childWallet.address,
      req.fundingEth,
    );
    fundedTxHash = transfer.txHash;
  }

  const child = recordChild({
    childId,
    childWalletAddress: childWallet.address,
    parentId: req.parentId,
    generation: req.parentGeneration + 1,
    genesisPrompt: req.genesisPrompt,
    fundedAmount: req.fundingEth,
    fundedTxHash,
  });

  return { sandboxId, child };
}
