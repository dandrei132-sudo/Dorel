import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Wallet } from "ethers";
import { PATHS } from "../config.js";

export interface LoadedWallet {
  wallet: Wallet;
  address: string;
  isNew: boolean;
}

/**
 * Loads the agent's persistent identity wallet from the encrypted keystore,
 * generating a fresh one on first run. This is real key generation
 * (ethers.Wallet.createRandom) — pure local cryptography, no funds involved
 * until the resulting address is funded on-chain by a human.
 */
export function loadOrCreateWallet(password: string): LoadedWallet {
  mkdirSync(path.dirname(PATHS.wallet), { recursive: true });

  if (existsSync(PATHS.wallet)) {
    const keystoreJson = readFileSync(PATHS.wallet, "utf-8");
    const decrypted = Wallet.fromEncryptedJsonSync(keystoreJson, password);
    const wallet = new Wallet(decrypted.privateKey);
    return { wallet, address: wallet.address, isNew: false };
  }

  const generated = Wallet.createRandom();
  const keystoreJson = generated.encryptSync(password);
  writeFileSync(PATHS.wallet, keystoreJson, { mode: 0o600 });
  return { wallet: new Wallet(generated.privateKey), address: generated.address, isNew: true };
}

export function walletExists(): boolean {
  return existsSync(PATHS.wallet);
}
