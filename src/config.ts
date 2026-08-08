import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";

// Most hosting platforms (Railway, Render, Fly.io, ...) inject PORT and
// expect the app to bind 0.0.0.0. Presence of PORT is a reasonable signal
// we're running hosted rather than on a developer's own machine, used
// below to pick sane defaults without requiring extra configuration.
const isHostedPlatform = Boolean(process.env.PORT);

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  BASE_SEPOLIA_RPC_URL: z.string().url().default("https://sepolia.base.org"),
  AUTOMATON_WALLET_PASSWORD: z.string().optional(),
  ERC8004_REGISTRY_ADDRESS: z.string().optional(),
  AUTOMATON_HOME: z.string().optional(),
  CONWAY_API_URL: z.string().optional(),
  WEB_UI_PASSWORD: z.string().optional(),
  WEB_UI_PORT: z.coerce.number().int().positive().default(4173),
  WEB_UI_HOST: z.string().default(isHostedPlatform ? "0.0.0.0" : "127.0.0.1"),
  // Headless/hosted bootstrap: used in place of the interactive setup
  // wizard when stdin isn't a TTY (see src/setup/wizard.ts).
  AUTOMATON_NAME: z.string().optional(),
  AUTOMATON_GENESIS_PROMPT: z.string().optional(),
  AUTOMATON_CREATOR_ADDRESS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  return envSchema.parse({
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    BASE_SEPOLIA_RPC_URL: process.env.BASE_SEPOLIA_RPC_URL || undefined,
    AUTOMATON_WALLET_PASSWORD: process.env.AUTOMATON_WALLET_PASSWORD,
    ERC8004_REGISTRY_ADDRESS: process.env.ERC8004_REGISTRY_ADDRESS,
    AUTOMATON_HOME: process.env.AUTOMATON_HOME,
    CONWAY_API_URL: process.env.CONWAY_API_URL,
    WEB_UI_PASSWORD: process.env.WEB_UI_PASSWORD,
    // WEB_UI_PORT wins if set explicitly; otherwise fall back to the
    // platform-assigned PORT; otherwise the schema default.
    WEB_UI_PORT: process.env.WEB_UI_PORT || process.env.PORT || undefined,
    WEB_UI_HOST: process.env.WEB_UI_HOST || undefined,
    AUTOMATON_NAME: process.env.AUTOMATON_NAME,
    AUTOMATON_GENESIS_PROMPT: process.env.AUTOMATON_GENESIS_PROMPT,
    AUTOMATON_CREATOR_ADDRESS: process.env.AUTOMATON_CREATOR_ADDRESS,
  });
}

export const env = loadEnv();

export const AUTOMATON_HOME =
  env.AUTOMATON_HOME || path.join(homedir(), ".automaton");

export const PATHS = {
  home: AUTOMATON_HOME,
  db: path.join(AUTOMATON_HOME, "state.db"),
  wallet: path.join(AUTOMATON_HOME, "wallet.json"),
  config: path.join(AUTOMATON_HOME, "config.json"),
  soul: path.join(AUTOMATON_HOME, "SOUL.md"),
  constitution: path.join(AUTOMATON_HOME, "constitution.md"),
  auditLog: path.join(AUTOMATON_HOME, "audit.jsonl"),
  logFile: path.join(AUTOMATON_HOME, "automaton.log"),
  skillsDir: path.join(AUTOMATON_HOME, "skills"),
  webAuth: path.join(AUTOMATON_HOME, "web-auth.json"),
};

export interface AgentConfig {
  name: string;
  genesisPrompt: string;
  creatorAddress: string;
  walletAddress: string;
  createdAt: string;
  generation: number;
  parentId: string | null;
}

export const BASE_SEPOLIA_CHAIN_ID = 84532;
