import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { PATHS } from "../config.js";
import { commitStateChange } from "../git/state-versioning.js";
import { getDb } from "../state/db.js";
import { guardWrite } from "./protected-files.js";
import { selfModRateLimiter } from "./rate-limiter.js";

export interface SelfModAttempt {
  action: string;
  target: string;
  detail?: string;
}

export interface SelfModOutcome {
  allowed: boolean;
  reason?: string;
  commitHash?: string | null;
}

function appendJsonl(entry: Record<string, unknown>): void {
  mkdirSync(path.dirname(PATHS.auditLog), { recursive: true });
  appendFileSync(PATHS.auditLog, JSON.stringify(entry) + "\n");
}

/**
 * The single choke point every self-modification tool call must go
 * through: checks the protected-file guard, then the rate limiter, and —
 * only if both pass and the caller reports the write succeeded — records
 * an audit entry (JSONL + SQLite + a git commit of ~/.automaton) so every
 * change to the agent is logged and revertible.
 */
export function recordSelfMod(
  attempt: SelfModAttempt,
  applyChange: () => void,
): SelfModOutcome {
  const guard = guardWrite(attempt.target);
  if (!guard.allowed) {
    logOutcome(attempt, false, guard.reason);
    return { allowed: false, reason: guard.reason };
  }

  if (!selfModRateLimiter.tryAcquire()) {
    const reason = "Self-modification rate limit exceeded; try again later.";
    logOutcome(attempt, false, reason);
    return { allowed: false, reason };
  }

  applyChange();

  const commitHash = commitStateChange(
    `self-mod: ${attempt.action} ${attempt.target}`,
  );
  logOutcome(attempt, true, attempt.detail, commitHash);
  return { allowed: true, commitHash };
}

function logOutcome(
  attempt: SelfModAttempt,
  allowed: boolean,
  detail?: string,
  commitHash?: string | null,
): void {
  const entry = {
    action: attempt.action,
    target: attempt.target,
    allowed,
    detail: detail ?? null,
    commitHash: commitHash ?? null,
    timestamp: new Date().toISOString(),
  };
  appendJsonl(entry);
  getDb()
    .prepare(
      "INSERT INTO audit_log (action, target, allowed, detail, commit_hash) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      attempt.action,
      attempt.target,
      allowed ? 1 : 0,
      detail ?? null,
      commitHash ?? null,
    );
}
