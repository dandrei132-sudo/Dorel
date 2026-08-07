import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let tmpHome: string;
let loadOrCreateWallet: typeof import("../src/identity/wallet.js")["loadOrCreateWallet"];
let walletExists: typeof import("../src/identity/wallet.js")["walletExists"];

beforeAll(async () => {
  tmpHome = mkdtempSync(path.join(tmpdir(), "automaton-wallet-"));
  process.env.AUTOMATON_HOME = tmpHome;
  ({ loadOrCreateWallet, walletExists } = await import("../src/identity/wallet.js"));
});

afterAll(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  delete process.env.AUTOMATON_HOME;
});

describe("wallet keystore", () => {
  it("has no keystore before first use", () => {
    expect(walletExists()).toBe(false);
  });

  it("generates a new wallet and persists an encrypted keystore", () => {
    const { address, isNew, wallet } = loadOrCreateWallet("correct horse battery staple");
    expect(isNew).toBe(true);
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(wallet.address).toBe(address);
    expect(walletExists()).toBe(true);
  });

  it("reloads the same wallet with the correct password", () => {
    const first = loadOrCreateWallet("correct horse battery staple");
    const second = loadOrCreateWallet("correct horse battery staple");
    expect(second.isNew).toBe(false);
    expect(second.address).toBe(first.address);
  });

  it("rejects the wrong password", () => {
    expect(() => loadOrCreateWallet("totally wrong password")).toThrow();
  });
});
