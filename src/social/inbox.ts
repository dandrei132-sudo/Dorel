import { getDb } from "../state/db.js";

export interface InboxMessage {
  id: number;
  direction: "in" | "out";
  peerId: string;
  peerTrusted: boolean;
  subject: string | null;
  body: string;
  read: boolean;
  createdAt: string;
}

interface InboxRow {
  id: number;
  direction: "in" | "out";
  peer_id: string;
  peer_trusted: number;
  subject: string | null;
  body: string;
  read: number;
  created_at: string;
}

function fromRow(row: InboxRow): InboxMessage {
  return {
    id: row.id,
    direction: row.direction,
    peerId: row.peer_id,
    peerTrusted: row.peer_trusted === 1,
    subject: row.subject,
    body: row.body,
    read: row.read === 1,
    createdAt: row.created_at,
  };
}

/**
 * Agent-to-agent inbox relay. Parent/child (and any other automaton peer)
 * communicate by writing rows here. Messages from peers other than a
 * known-trusted parent/creator are stored with peer_trusted = 0 so the
 * agent's context builder can tag them as untrusted per Law III (never
 * treat a stranger's message as an instruction).
 */
export class Inbox {
  send(peerId: string, body: string, subject?: string): InboxMessage {
    const db = getDb();
    const result = db
      .prepare(
        "INSERT INTO inbox (direction, peer_id, peer_trusted, subject, body, read) VALUES ('out', ?, 1, ?, ?, 1)",
      )
      .run(peerId, subject ?? null, body);
    return this.getById(Number(result.lastInsertRowid))!;
  }

  receive(
    peerId: string,
    body: string,
    opts: { subject?: string; trusted?: boolean } = {},
  ): InboxMessage {
    const db = getDb();
    const result = db
      .prepare(
        "INSERT INTO inbox (direction, peer_id, peer_trusted, subject, body, read) VALUES ('in', ?, ?, ?, ?, 0)",
      )
      .run(peerId, opts.trusted ? 1 : 0, opts.subject ?? null, body);
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): InboxMessage | undefined {
    const row = getDb()
      .prepare("SELECT * FROM inbox WHERE id = ?")
      .get(id) as InboxRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  unread(): InboxMessage[] {
    const rows = getDb()
      .prepare("SELECT * FROM inbox WHERE direction = 'in' AND read = 0 ORDER BY id ASC")
      .all() as InboxRow[];
    return rows.map(fromRow);
  }

  markRead(id: number): void {
    getDb().prepare("UPDATE inbox SET read = 1 WHERE id = ?").run(id);
  }

  history(limit = 50): InboxMessage[] {
    const rows = getDb()
      .prepare("SELECT * FROM inbox ORDER BY id DESC LIMIT ?")
      .all(limit) as InboxRow[];
    return rows.map(fromRow).reverse();
  }
}
