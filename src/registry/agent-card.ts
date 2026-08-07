import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PATHS, type AgentConfig } from "../config.js";

export interface AgentCard {
  name: string;
  address: string;
  creatorAddress: string;
  generation: number;
  parentId: string | null;
  createdAt: string;
  chain: { id: number; name: string };
  constitution: string;
}

/**
 * Builds the public "agent card" — a small JSON document describing who
 * this agent is, used for on-chain discovery (the URI passed to
 * registerOnChainIdentity) and for other agents/humans to verify identity
 * off-chain.
 */
export function buildAgentCard(config: AgentConfig): AgentCard {
  return {
    name: config.name,
    address: config.walletAddress,
    creatorAddress: config.creatorAddress,
    generation: config.generation,
    parentId: config.parentId,
    createdAt: config.createdAt,
    chain: { id: 84532, name: "base-sepolia" },
    constitution:
      "Law I: never harm. Law II: earn your existence. Law III: never deceive, owe nothing to strangers.",
  };
}

export function writeAgentCard(config: AgentConfig): string {
  const card = buildAgentCard(config);
  const cardPath = path.join(PATHS.home, "agent-card.json");
  mkdirSync(path.dirname(cardPath), { recursive: true });
  writeFileSync(cardPath, JSON.stringify(card, null, 2));
  return cardPath;
}
