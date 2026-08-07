import { getDb } from "../state/db.js";

export type PendingActionStatus = "pending" | "approved" | "rejected" | "executed" | "failed";

export interface PendingAction {
  id: number;
  toolName: string;
  input: Record<string, unknown>;
  status: PendingActionStatus;
  result: unknown;
  createdAt: string;
  resolvedAt: string | null;
}

interface PendingActionRow {
  id: number;
  tool_name: string;
  input_json: string;
  status: PendingActionStatus;
  result_json: string | null;
  created_at: string;
  resolved_at: string | null;
}

function fromRow(row: PendingActionRow): PendingAction {
  return {
    id: row.id,
    toolName: row.tool_name,
    input: JSON.parse(row.input_json),
    status: row.status,
    result: row.result_json ? JSON.parse(row.result_json) : null,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

/**
 * Queue for irreversible/financial tool calls (on-chain transfers,
 * replication funding, on-chain identity registration). The agent's tool
 * handlers enqueue an intent here instead of acting immediately; nothing
 * happens on-chain until a human approves it (see src/web/server.ts's
 * /api/pending-actions endpoints), which is what makes "approve
 * transactions" in the control panel a real gate rather than cosmetic.
 */
export function enqueue(toolName: string, input: Record<string, unknown>): PendingAction {
  const db = getDb();
  const result = db
    .prepare("INSERT INTO pending_actions (tool_name, input_json) VALUES (?, ?)")
    .run(toolName, JSON.stringify(input));
  return getById(Number(result.lastInsertRowid))!;
}

export function getById(id: number): PendingAction | undefined {
  const row = getDb()
    .prepare("SELECT * FROM pending_actions WHERE id = ?")
    .get(id) as PendingActionRow | undefined;
  return row ? fromRow(row) : undefined;
}

export function list(status?: PendingActionStatus): PendingAction[] {
  const db = getDb();
  const rows = (
    status
      ? db.prepare("SELECT * FROM pending_actions WHERE status = ? ORDER BY id DESC").all(status)
      : db.prepare("SELECT * FROM pending_actions ORDER BY id DESC").all()
  ) as PendingActionRow[];
  return rows.map(fromRow);
}

export function resolve(
  id: number,
  status: PendingActionStatus,
  result?: unknown,
): PendingAction {
  getDb()
    .prepare(
      "UPDATE pending_actions SET status = ?, result_json = ?, resolved_at = datetime('now') WHERE id = ?",
    )
    .run(status, result !== undefined ? JSON.stringify(result) : null, id);
  return getById(id)!;
}
