import type Anthropic from "@anthropic-ai/sdk";
import { getDb } from "../state/db.js";
import { tagUntrusted } from "./injection-defense.js";

export type ApiMessage = Anthropic.Messages.MessageParam;

interface MessageRow {
  role: "user" | "assistant";
  content: string;
  trusted: number;
}

/**
 * Loads recent conversation history from SQLite and formats it for the
 * Anthropic API, tagging any untrusted turns (e.g. relayed inbox messages
 * from unverified peers) on the way out so old untrusted content doesn't
 * silently read as instructions on replay.
 */
export function loadRecentContext(limit = 40): ApiMessage[] {
  const rows = getDb()
    .prepare(
      "SELECT role, content, trusted FROM messages ORDER BY id DESC LIMIT ?",
    )
    .all(limit) as MessageRow[];

  return rows.reverse().map((row) => ({
    role: row.role,
    content:
      row.trusted === 1 ? row.content : tagUntrusted("history", row.content),
  }));
}

export function appendMessage(
  role: "user" | "assistant",
  content: string,
  trusted = true,
): void {
  getDb()
    .prepare("INSERT INTO messages (role, content, trusted) VALUES (?, ?, ?)")
    .run(role, content, trusted ? 1 : 0);
}
