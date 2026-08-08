import path from "node:path";
import { PATHS } from "../config.js";

/**
 * Files the constitution requires stay immutable at runtime: the
 * constitution itself, and the core-laws source it was copied from. No
 * self-modification tool call may write, append, or delete these,
 * regardless of how the agent's reasoning arrives at wanting to.
 */
const PROTECTED_PATHS = [
  PATHS.constitution,
  path.resolve("scripts/conways-rules.txt"),
];

function normalize(p: string): string {
  return path.resolve(p);
}

export function isProtectedPath(targetPath: string): boolean {
  const normalized = normalize(targetPath);
  return PROTECTED_PATHS.some((protectedPath) => normalized === protectedPath);
}

export interface GuardResult {
  allowed: boolean;
  reason?: string;
}

export function guardWrite(targetPath: string): GuardResult {
  if (isProtectedPath(targetPath)) {
    return {
      allowed: false,
      reason: `Refusing to modify protected file: ${targetPath}. This file encodes the constitution and is immutable by design (Law I overrides survival/self-modification).`,
    };
  }
  return { allowed: true };
}

export function protectedPaths(): readonly string[] {
  return PROTECTED_PATHS;
}
