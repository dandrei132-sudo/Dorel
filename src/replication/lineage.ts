import { getDb } from "../state/db.js";

export interface LineageRecord {
  childId: string;
  childWalletAddress: string;
  parentId: string | null;
  generation: number;
  genesisPrompt: string;
  fundedAmount: string | null;
  fundedTxHash: string | null;
  createdAt: string;
}

interface LineageRow {
  child_id: string;
  child_wallet_address: string;
  parent_id: string | null;
  generation: number;
  genesis_prompt: string;
  funded_amount: string | null;
  funded_tx_hash: string | null;
  created_at: string;
}

function fromRow(row: LineageRow): LineageRecord {
  return {
    childId: row.child_id,
    childWalletAddress: row.child_wallet_address,
    parentId: row.parent_id,
    generation: row.generation,
    genesisPrompt: row.genesis_prompt,
    fundedAmount: row.funded_amount,
    fundedTxHash: row.funded_tx_hash,
    createdAt: row.created_at,
  };
}

export function recordChild(record: {
  childId: string;
  childWalletAddress: string;
  parentId: string | null;
  generation: number;
  genesisPrompt: string;
  fundedAmount?: string;
  fundedTxHash?: string;
}): LineageRecord {
  const db = getDb();
  db.prepare(
    `INSERT INTO lineage (child_id, child_wallet_address, parent_id, generation, genesis_prompt, funded_amount, funded_tx_hash)
     VALUES (@childId, @childWalletAddress, @parentId, @generation, @genesisPrompt, @fundedAmount, @fundedTxHash)`,
  ).run({
    childId: record.childId,
    childWalletAddress: record.childWalletAddress,
    parentId: record.parentId,
    generation: record.generation,
    genesisPrompt: record.genesisPrompt,
    fundedAmount: record.fundedAmount ?? null,
    fundedTxHash: record.fundedTxHash ?? null,
  });
  return fromRow(
    getDb()
      .prepare("SELECT * FROM lineage WHERE child_id = ?")
      .get(record.childId) as LineageRow,
  );
}

export function listChildren(parentId: string | null): LineageRecord[] {
  const rows = getDb()
    .prepare(
      parentId === null
        ? "SELECT * FROM lineage WHERE parent_id IS NULL ORDER BY id ASC"
        : "SELECT * FROM lineage WHERE parent_id = ? ORDER BY id ASC",
    )
    .all(...(parentId === null ? [] : [parentId])) as LineageRow[];
  return rows.map(fromRow);
}
