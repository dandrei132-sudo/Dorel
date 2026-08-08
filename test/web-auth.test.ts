import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let tmpHome: string;
let loadOrCreateWebAuthState: typeof import("../src/web/auth.js")["loadOrCreateWebAuthState"];
let verifyPassword: typeof import("../src/web/auth.js")["verifyPassword"];
let signSessionToken: typeof import("../src/web/auth.js")["signSessionToken"];
let verifySessionToken: typeof import("../src/web/auth.js")["verifySessionToken"];
/** The plaintext password generated on the very first (and only) creation of web-auth.json in this file's tmpHome — every later loadOrCreateWebAuthState() call returns generatedPassword: null since the file already exists. */
let firstGeneratedPassword: string;

beforeAll(async () => {
  tmpHome = mkdtempSync(path.join(tmpdir(), "automaton-webauth-"));
  process.env.AUTOMATON_HOME = tmpHome;
  delete process.env.WEB_UI_PASSWORD;
  ({ loadOrCreateWebAuthState, verifyPassword, signSessionToken, verifySessionToken } = await import(
    "../src/web/auth.js"
  ));
});

afterAll(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  delete process.env.AUTOMATON_HOME;
});

describe("web auth: generated password flow", () => {
  it("generates a password on first load and persists a hash, not the plaintext", () => {
    const { state, generatedPassword } = loadOrCreateWebAuthState();
    expect(generatedPassword).not.toBeNull();
    expect(state.passwordHash).toBeDefined();
    expect(state.passwordSalt).toBeDefined();
    expect(JSON.stringify(state)).not.toContain(generatedPassword);
    firstGeneratedPassword = generatedPassword!;
  });

  it("does not regenerate the password on subsequent loads", () => {
    const first = loadOrCreateWebAuthState();
    const second = loadOrCreateWebAuthState();
    expect(second.generatedPassword).toBeNull();
    expect(second.state.passwordHash).toBe(first.state.passwordHash);
  });

  it("verifies the correct generated password and rejects wrong ones", () => {
    const { state } = loadOrCreateWebAuthState();
    expect(verifyPassword(firstGeneratedPassword, state)).toBe(true);
    expect(verifyPassword("definitely wrong", state)).toBe(false);
  });
});

describe("web auth: session tokens", () => {
  it("round-trips a freshly signed token", () => {
    const { state } = loadOrCreateWebAuthState();
    const token = signSessionToken(state);
    expect(verifySessionToken(token, state)).toBe(true);
  });

  it("rejects a token signed with a different session secret", () => {
    const { state } = loadOrCreateWebAuthState();
    const otherState = { ...state, sessionSecret: "a-completely-different-secret" };
    const token = signSessionToken(otherState);
    expect(verifySessionToken(token, state)).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const { state } = loadOrCreateWebAuthState();
    const token = signSessionToken(state);
    const [, signature] = token.split(".");
    const tampered = `${Buffer.from(JSON.stringify({ iat: Date.now() + 999999 })).toString("base64url")}.${signature}`;
    expect(verifySessionToken(tampered, state)).toBe(false);
  });

  it("rejects a malformed token", () => {
    const { state } = loadOrCreateWebAuthState();
    expect(verifySessionToken("not-a-valid-token", state)).toBe(false);
    expect(verifySessionToken("", state)).toBe(false);
  });

  it("rejects an expired token", () => {
    const { state } = loadOrCreateWebAuthState();
    const token = signSessionToken(state);
    expect(verifySessionToken(token, state, -1)).toBe(false);
  });
});
