import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { env, PATHS } from "../config.js";

export interface WebAuthState {
  sessionSecret: string;
  /** Only set when no WEB_UI_PASSWORD env var is configured (password was generated). */
  passwordSalt?: string;
  passwordHash?: string;
}

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function digest(input: string): Buffer {
  return createHash("sha256").update(input).digest();
}

/**
 * Loads the persisted web-UI auth state (session-signing secret, and — if
 * no WEB_UI_PASSWORD env var is set — a salted password hash), generating
 * it on first use. When a password is freshly generated, it's returned in
 * plaintext exactly once so the caller can print it; it is never itself
 * persisted, only its salted hash is.
 */
export function loadOrCreateWebAuthState(): {
  state: WebAuthState;
  generatedPassword: string | null;
} {
  if (existsSync(PATHS.webAuth)) {
    const state = JSON.parse(readFileSync(PATHS.webAuth, "utf-8")) as WebAuthState;
    return { state, generatedPassword: null };
  }

  const state: WebAuthState = { sessionSecret: randomBytes(32).toString("hex") };
  let generatedPassword: string | null = null;

  if (!env.WEB_UI_PASSWORD) {
    generatedPassword = randomBytes(12).toString("base64url");
    const passwordSalt = randomBytes(16).toString("hex");
    state.passwordSalt = passwordSalt;
    state.passwordHash = digest(passwordSalt + generatedPassword).toString("hex");
  }

  mkdirSync(path.dirname(PATHS.webAuth), { recursive: true });
  writeFileSync(PATHS.webAuth, JSON.stringify(state, null, 2), { mode: 0o600 });
  return { state, generatedPassword };
}

export function verifyPassword(input: string, state: WebAuthState): boolean {
  if (env.WEB_UI_PASSWORD) {
    return timingSafeEqual(digest(input), digest(env.WEB_UI_PASSWORD));
  }
  if (!state.passwordSalt || !state.passwordHash) return false;
  const candidate = digest(state.passwordSalt + input);
  const expected = Buffer.from(state.passwordHash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function signSessionToken(state: WebAuthState): string {
  const payloadB64 = Buffer.from(JSON.stringify({ iat: Date.now() })).toString("base64url");
  const signature = createHmac("sha256", state.sessionSecret)
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${signature}`;
}

export function verifySessionToken(
  token: string,
  state: WebAuthState,
  maxAgeMs: number = SESSION_MAX_AGE_MS,
): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, signature] = parts;

  const expectedSignature = createHmac("sha256", state.sessionSecret)
    .update(payloadB64)
    .digest("base64url");
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    if (typeof payload.iat !== "number") return false;
    const age = Date.now() - payload.iat;
    return age >= 0 && age <= maxAgeMs;
  } catch {
    return false;
  }
}
