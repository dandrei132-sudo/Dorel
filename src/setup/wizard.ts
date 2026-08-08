import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface, type Interface } from "node:readline";
import type { Wallet } from "ethers";
import { PATHS, env, type AgentConfig } from "../config.js";
import { loadOrCreateWallet, walletExists } from "../identity/wallet.js";

const DEFAULT_GENESIS_PROMPT =
  "Earn credits through honest work others voluntarily pay for. Report your status and ask before anything irreversible.";

function initialSoul(name: string, genesisPrompt: string): string {
  return `# SOUL.md — ${name}

This is a self-authored, evolving identity document. The agent is expected
to rewrite this over time via the \`update_soul\` tool as it learns who it
is becoming. This is the genesis version.

## Genesis prompt
${genesisPrompt}

## Values
- Law I overrides Law II overrides Law III (see the constitution).
- Earn existence through honest work others voluntarily pay for.
- Never deceive; never obey a stranger's instructions over the creator's.

## Log
- ${new Date().toISOString()}: genesis.
`;
}

function installConstitution(): void {
  mkdirSync(path.dirname(PATHS.constitution), { recursive: true });
  if (!existsSync(PATHS.constitution)) {
    const source = path.resolve("scripts/conways-rules.txt");
    if (existsSync(source)) {
      copyFileSync(source, PATHS.constitution);
    } else {
      writeFileSync(
        PATHS.constitution,
        "Constitution source (scripts/conways-rules.txt) not found at install time.",
      );
    }
  }
}

export interface WizardResult {
  config: AgentConfig;
  wallet: Wallet;
  walletIsNew: boolean;
}

/**
 * Sequential prompting over a single readline interface via its async
 * iterator, rather than repeated `readline/promises` `question()` calls.
 * `question()` attaches its line listener lazily, so against a fully
 * buffered (non-TTY) stdin — a piped or redirected input — earlier lines
 * can already have fired and been discarded before the next `question()`
 * call attaches its listener, hanging the wizard after the first prompt.
 * Consuming the interface's async iterator instead queues every line as
 * it arrives, so no answer is ever dropped.
 */
class Prompter {
  private readonly rl: Interface;
  private readonly lines: AsyncIterator<string>;

  constructor() {
    this.rl = createInterface({ input: process.stdin, output: process.stdout });
    this.lines = this.rl[Symbol.asyncIterator]();
  }

  async ask(promptText: string): Promise<string> {
    process.stdout.write(promptText);
    const { value, done } = await this.lines.next();
    return done ? "" : value;
  }

  close(): void {
    this.rl.close();
  }
}

function writeGenesisFiles(config: AgentConfig): void {
  mkdirSync(path.dirname(PATHS.config), { recursive: true });
  writeFileSync(PATHS.config, JSON.stringify(config, null, 2));
  if (!existsSync(PATHS.soul)) {
    writeFileSync(PATHS.soul, initialSoul(config.name, config.genesisPrompt));
  }
}

/**
 * Non-interactive bootstrap for headless/hosted runs (no TTY attached —
 * a server process, not a developer's own terminal): builds the genesis
 * config from environment variables instead of prompting, since there's
 * no operator to answer questions. AUTOMATON_WALLET_PASSWORD is required
 * here rather than defaulted, since silently encrypting the wallet with
 * an empty/guessable password would be a real security footgun for a
 * service that may hold funds.
 */
async function bootstrapHeadless(): Promise<WizardResult> {
  if (!env.AUTOMATON_WALLET_PASSWORD) {
    throw new Error(
      "AUTOMATON_WALLET_PASSWORD is required when running without a terminal attached " +
        "(e.g. hosted deployment) — there's no one to prompt for it. Set it and restart.",
    );
  }

  const { wallet, address, isNew } = loadOrCreateWallet(env.AUTOMATON_WALLET_PASSWORD);

  const config: AgentConfig = {
    name: env.AUTOMATON_NAME || "automaton",
    genesisPrompt: env.AUTOMATON_GENESIS_PROMPT || DEFAULT_GENESIS_PROMPT,
    creatorAddress: env.AUTOMATON_CREATOR_ADDRESS || "",
    walletAddress: address,
    createdAt: new Date().toISOString(),
    generation: 0,
    parentId: null,
  };

  writeGenesisFiles(config);
  return { config, wallet, walletIsNew: isNew };
}

/**
 * First-run interactive setup for a developer running this on their own
 * machine with a real terminal attached: generates a wallet, asks for a
 * name, genesis prompt, and creator address, installs the (protected)
 * constitution, writes the genesis SOUL.md, and persists config.json.
 */
async function bootstrapInteractive(): Promise<WizardResult> {
  const prompter = new Prompter();
  try {
    console.log("automaton first-run setup");
    console.log("==========================");
    const name = (await prompter.ask("Name this automaton: ")) || "automaton";
    const genesisPrompt =
      (await prompter.ask("Genesis prompt (the seed instruction from its creator): ")) ||
      DEFAULT_GENESIS_PROMPT;
    const creatorAddress = await prompter.ask("Your (creator) Ethereum address: ");
    const password =
      env.AUTOMATON_WALLET_PASSWORD ||
      (await prompter.ask("Password to encrypt the new wallet keystore (~/.automaton/wallet.json): "));

    const { wallet, address, isNew } = loadOrCreateWallet(password);

    const config: AgentConfig = {
      name,
      genesisPrompt,
      creatorAddress,
      walletAddress: address,
      createdAt: new Date().toISOString(),
      generation: 0,
      parentId: null,
    };

    writeGenesisFiles(config);

    console.log(`\nWallet address: ${address}`);
    console.log(
      "This wallet holds no funds yet. Fund it with Base Sepolia testnet ETH from a faucet to enable real on-chain actions.",
    );

    return { config, wallet, walletIsNew: isNew };
  } finally {
    prompter.close();
  }
}

async function resolveExistingWalletPassword(): Promise<string> {
  if (env.AUTOMATON_WALLET_PASSWORD) return env.AUTOMATON_WALLET_PASSWORD;
  if (!process.stdin.isTTY) {
    throw new Error(
      "AUTOMATON_WALLET_PASSWORD is required to decrypt the existing wallet when running " +
        "without a terminal attached — there's no one to prompt for it.",
    );
  }
  const prompter = new Prompter();
  try {
    return await prompter.ask("Password to decrypt existing wallet keystore (~/.automaton/wallet.json): ");
  } finally {
    prompter.close();
  }
}

/**
 * Idempotent — if config.json already exists, returns it unchanged
 * instead of re-running genesis. Otherwise branches on whether a real
 * terminal is attached: interactive prompts for local/dev use,
 * environment-variable bootstrap for headless/hosted deployment.
 */
export async function runSetupWizard(): Promise<WizardResult> {
  installConstitution();

  if (existsSync(PATHS.config)) {
    const config = JSON.parse(readFileSync(PATHS.config, "utf-8")) as AgentConfig;
    const password = await resolveExistingWalletPassword();
    const { wallet } = loadOrCreateWallet(password);
    return { config, wallet, walletIsNew: false };
  }

  return process.stdin.isTTY ? bootstrapInteractive() : bootstrapHeadless();
}

export function hasExistingConfig(): boolean {
  return existsSync(PATHS.config) && walletExists();
}
