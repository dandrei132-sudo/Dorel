import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { PATHS } from "../config.js";

function git(args: string[], cwd: string = PATHS.home): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

/**
 * Ensures ~/.automaton is a git repository, so every self-modification can
 * be committed and the full history of "who the agent became" is
 * inspectable and revertible by its creator (per the constitution's audit
 * rights).
 */
export function ensureStateRepo(): void {
  mkdirSync(PATHS.home, { recursive: true });
  if (!existsSync(`${PATHS.home}/.git`)) {
    git(["init"]);
    git(["config", "user.email", "automaton@local"]);
    git(["config", "user.name", "automaton"]);
  }
}

/**
 * Stages and commits the current state of ~/.automaton. Returns the new
 * commit hash, or null if there was nothing to commit.
 */
export function commitStateChange(message: string): string | null {
  ensureStateRepo();
  git(["add", "-A"]);
  const status = git(["status", "--porcelain"]);
  if (!status) return null;
  git(["commit", "-m", message]);
  return git(["rev-parse", "HEAD"]);
}

export function stateHistory(limit = 20): string[] {
  ensureStateRepo();
  try {
    const log = git(["log", `-${limit}`, "--pretty=format:%H %ad %s", "--date=iso"]);
    return log ? log.split("\n") : [];
  } catch {
    return [];
  }
}
