#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { Command } from "commander";
import { JsonRpcProvider, Wallet, formatEther, parseEther } from "ethers";
import { PATHS } from "./paths.js";
import { tierForBalance } from "./tiers.js";

interface AgentConfig {
  name: string;
  walletAddress: string;
  creatorAddress: string;
  createdAt: string;
  generation: number;
  parentId: string | null;
}

const program = new Command();
program
  .name("automaton-cli")
  .description("Creator CLI for inspecting and funding a running Automaton agent.");

program
  .command("status")
  .description("Show the agent's identity, credit balance, and survival tier")
  .action(() => {
    if (!existsSync(PATHS.config)) {
      console.error(`No agent found at ${PATHS.home}. Has it been set up yet?`);
      process.exitCode = 1;
      return;
    }
    const config: AgentConfig = JSON.parse(readFileSync(PATHS.config, "utf-8"));
    const uptimeMs = Date.now() - new Date(config.createdAt).getTime();

    console.log(`name:            ${config.name}`);
    console.log(`wallet:          ${config.walletAddress}`);
    console.log(`creator:         ${config.creatorAddress}`);
    console.log(`generation:      ${config.generation}${config.parentId ? ` (child of ${config.parentId})` : " (genesis)"}`);

    if (!existsSync(PATHS.db)) {
      console.log("credits:         (no state.db yet — the agent hasn't run with a Conway client configured)");
      console.log("survival tier:   unknown");
    } else {
      const db = new Database(PATHS.db, { readonly: true, fileMustExist: true });
      const row = db
        .prepare("SELECT balance_after FROM credits_ledger ORDER BY id DESC LIMIT 1")
        .get() as { balance_after: number } | undefined;
      db.close();
      const credits = row?.balance_after ?? 0;
      console.log(`credits:         ${credits.toFixed(4)}`);
      console.log(`survival tier:   ${tierForBalance(credits)}`);
    }
    console.log(`uptime:          ${formatDuration(uptimeMs)}`);
  });

program
  .command("logs")
  .description("Show recent log lines from the running agent")
  .option("--tail <n>", "number of lines to show", "20")
  .action((opts) => {
    if (!existsSync(PATHS.logFile)) {
      console.error(`No log file found at ${PATHS.logFile}`);
      process.exitCode = 1;
      return;
    }
    const n = Number.parseInt(opts.tail, 10) || 20;
    const lines = readFileSync(PATHS.logFile, "utf-8").split("\n").filter(Boolean);
    for (const line of lines.slice(-n)) console.log(line);
  });

program
  .command("fund")
  .description(
    "Send real Base Sepolia testnet ETH from your own funder wallet to the agent's wallet",
  )
  .argument("<amountEth>", "amount of testnet ETH to send, e.g. 0.01")
  .option(
    "--funder-key <privateKey>",
    "private key of the wallet to send from (or set FUNDER_PRIVATE_KEY env var)",
  )
  .option("--rpc-url <url>", "Base Sepolia RPC URL", "https://sepolia.base.org")
  .action(async (amountEth: string, opts) => {
    if (!existsSync(PATHS.config)) {
      console.error(`No agent found at ${PATHS.home}. Has it been set up yet?`);
      process.exitCode = 1;
      return;
    }
    const config: AgentConfig = JSON.parse(readFileSync(PATHS.config, "utf-8"));
    const privateKey = opts.funderKey || process.env.FUNDER_PRIVATE_KEY;
    if (!privateKey) {
      console.error(
        "No funder key provided. Pass --funder-key or set FUNDER_PRIVATE_KEY. " +
          "This must be a wallet you control that already holds Base Sepolia testnet ETH from a faucet.",
      );
      process.exitCode = 1;
      return;
    }

    const provider = new JsonRpcProvider(opts.rpcUrl, 84532);
    const funder = new Wallet(privateKey, provider);
    console.log(
      `Sending ${amountEth} testnet ETH from ${funder.address} to ${config.walletAddress} on Base Sepolia...`,
    );
    const tx = await funder.sendTransaction({
      to: config.walletAddress,
      value: parseEther(amountEth),
    });
    const receipt = await tx.wait();
    console.log(`Confirmed. Tx hash: ${receipt?.hash ?? tx.hash}`);
    const newBalance = await provider.getBalance(config.walletAddress);
    console.log(`Agent wallet balance: ${formatEther(newBalance)} ETH`);
  });

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

program.parse(process.argv);
