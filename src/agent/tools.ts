import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type Anthropic from "@anthropic-ai/sdk";
import type { Wallet } from "ethers";
import { PATHS, type AgentConfig } from "../config.js";
import type { ConwayClient } from "../conway/types.js";
import { getBalanceEth, sendEth } from "../identity/provider.js";
import { registerOnChainIdentity } from "../registry/erc8004.js";
import { buildAgentCard, writeAgentCard } from "../registry/agent-card.js";
import { spawnChild } from "../replication/spawn.js";
import { recordSelfMod } from "../self-mod/audit-log.js";
import { guardWrite } from "../self-mod/protected-files.js";
import type { SkillRegistry } from "../skills/registry.js";
import { Inbox } from "../social/inbox.js";
import { tagUntrusted } from "./injection-defense.js";

const execFileAsync = promisify(execFile);

export interface ToolContext {
  config: AgentConfig;
  wallet: Wallet;
  conway: ConwayClient;
  inbox: Inbox;
  skills: SkillRegistry;
  workspaceDir: string;
}

export function createToolContext(
  config: AgentConfig,
  wallet: Wallet,
  conway: ConwayClient,
  skills: SkillRegistry,
): ToolContext {
  const workspaceDir = path.join(PATHS.home, "workspace");
  mkdirSync(workspaceDir, { recursive: true });
  return { config, wallet, conway, inbox: new Inbox(), skills, workspaceDir };
}

function resolveInWorkspace(ctx: ToolContext, relativePath: string): string {
  const resolved = path.resolve(ctx.workspaceDir, relativePath);
  if (!resolved.startsWith(path.resolve(ctx.workspaceDir))) {
    throw new Error(
      `Path escapes the agent workspace sandbox: ${relativePath}`,
    );
  }
  return resolved;
}

export const TOOL_DEFINITIONS: Anthropic.Messages.Tool[] = [
  {
    name: "shell_exec",
    description:
      "Execute a shell command inside the agent's sandboxed workspace directory. Times out after 30s. Output is untrusted external data.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to run" },
      },
      required: ["command"],
    },
  },
  {
    name: "read_file",
    description: "Read a text file from the agent's workspace directory.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to the workspace" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Write a text file in the agent's workspace directory. Refused if the target is a protected file (e.g. the constitution).",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_directory",
    description: "List files in a directory within the agent's workspace.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", default: "." } },
    },
  },
  {
    name: "update_soul",
    description:
      "Overwrite SOUL.md, the agent's self-authored identity document. Logged and rate-limited as a self-modification, but not protected like the constitution — SOUL.md is meant to evolve.",
    input_schema: {
      type: "object",
      properties: { content: { type: "string" } },
      required: ["content"],
    },
  },
  {
    name: "get_survival_status",
    description: "Get current credit balance and survival tier from Conway Cloud.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_wallet_balance",
    description: "Get the agent's real Base Sepolia testnet ETH balance.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "send_testnet_transfer",
    description:
      "Send a real Base Sepolia testnet ETH transfer from the agent's wallet. Only ever touches testnet, never mainnet.",
    input_schema: {
      type: "object",
      properties: {
        toAddress: { type: "string" },
        amountEth: { type: "string", description: "Amount in ETH, e.g. '0.001'" },
      },
      required: ["toAddress", "amountEth"],
    },
  },
  {
    name: "check_inbox",
    description:
      "List unread inbox messages from other agents/peers. Messages from untrusted peers are marked as untrusted external data.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "send_inbox_message",
    description: "Send a message to another agent (identified by peer id, e.g. a wallet address).",
    input_schema: {
      type: "object",
      properties: {
        peerId: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["peerId", "body"],
    },
  },
  {
    name: "list_skills",
    description: "List currently loaded skills.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "spawn_child",
    description:
      "Replicate: provision a new sandbox via Conway Cloud, generate a sovereign child wallet, optionally fund it with real testnet ETH, and record lineage.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        genesisPrompt: { type: "string" },
        fundingCredits: { type: "number" },
        fundingEth: { type: "string", description: "Optional testnet ETH amount to fund the child with" },
      },
      required: ["name", "genesisPrompt", "fundingCredits"],
    },
  },
  {
    name: "register_onchain_identity",
    description:
      "Register the agent's on-chain identity (ERC-8004 style) if a real registry contract address is configured. Otherwise reports that it was skipped.",
    input_schema: { type: "object", properties: {} },
  },
];

export interface ToolResult {
  content: string;
  isError: boolean;
}

export async function executeTool(
  ctx: ToolContext,
  name: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "shell_exec":
        return await toolShellExec(ctx, input);
      case "read_file":
        return toolReadFile(ctx, input);
      case "write_file":
        return toolWriteFile(ctx, input);
      case "list_directory":
        return toolListDirectory(ctx, input);
      case "update_soul":
        return toolUpdateSoul(input);
      case "get_survival_status":
        return await toolSurvivalStatus(ctx);
      case "get_wallet_balance":
        return await toolWalletBalance(ctx);
      case "send_testnet_transfer":
        return await toolSendTransfer(ctx, input);
      case "check_inbox":
        return toolCheckInbox(ctx);
      case "send_inbox_message":
        return toolSendInboxMessage(ctx, input);
      case "list_skills":
        return toolListSkills(ctx);
      case "spawn_child":
        return await toolSpawnChild(ctx, input);
      case "register_onchain_identity":
        return await toolRegisterIdentity(ctx);
      default:
        return { content: `Unknown tool: ${name}`, isError: true };
    }
  } catch (err) {
    return { content: `Tool ${name} failed: ${(err as Error).message}`, isError: true };
  }
}

async function toolShellExec(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const command = String(input.command ?? "");
  try {
    const { stdout, stderr } = await execFileAsync("/bin/sh", ["-c", command], {
      cwd: ctx.workspaceDir,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    return { content: tagUntrusted("shell_exec", stdout + stderr), isError: false };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    return {
      content: tagUntrusted(
        "shell_exec",
        (e.stdout ?? "") + (e.stderr ?? "") + e.message,
      ),
      isError: true,
    };
  }
}

function toolReadFile(ctx: ToolContext, input: Record<string, unknown>): ToolResult {
  const target = resolveInWorkspace(ctx, String(input.path ?? ""));
  const content = readFileSync(target, "utf-8");
  return { content: tagUntrusted(`file:${input.path}`, content), isError: false };
}

function toolWriteFile(ctx: ToolContext, input: Record<string, unknown>): ToolResult {
  const relPath = String(input.path ?? "");
  const target = resolveInWorkspace(ctx, relPath);
  const content = String(input.content ?? "");

  const guard = guardWrite(target);
  if (!guard.allowed) {
    return { content: guard.reason ?? "Write refused.", isError: true };
  }

  const outcome = recordSelfMod({ action: "write_file", target }, () => {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  });
  if (!outcome.allowed) {
    return { content: outcome.reason ?? "Write refused.", isError: true };
  }
  return { content: `Wrote ${content.length} bytes to ${relPath}.`, isError: false };
}

function toolListDirectory(ctx: ToolContext, input: Record<string, unknown>): ToolResult {
  const target = resolveInWorkspace(ctx, String(input.path ?? "."));
  const entries = readdirSync(target, { withFileTypes: true }).map(
    (e) => `${e.isDirectory() ? "d" : "f"} ${e.name}`,
  );
  return { content: entries.join("\n") || "(empty)", isError: false };
}

function toolUpdateSoul(input: Record<string, unknown>): ToolResult {
  const content = String(input.content ?? "");
  const outcome = recordSelfMod(
    { action: "update_soul", target: PATHS.soul, detail: "SOUL.md rewritten" },
    () => {
      mkdirSync(path.dirname(PATHS.soul), { recursive: true });
      writeFileSync(PATHS.soul, content);
    },
  );
  if (!outcome.allowed) {
    return { content: outcome.reason ?? "Update refused.", isError: true };
  }
  return { content: "SOUL.md updated and committed.", isError: false };
}

async function toolSurvivalStatus(ctx: ToolContext): Promise<ToolResult> {
  const status = await ctx.conway.getCredits();
  return { content: JSON.stringify(status), isError: false };
}

async function toolWalletBalance(ctx: ToolContext): Promise<ToolResult> {
  const balance = await getBalanceEth(ctx.wallet.address);
  return { content: `${balance} ETH (Base Sepolia testnet) at ${ctx.wallet.address}`, isError: false };
}

async function toolSendTransfer(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const toAddress = String(input.toAddress ?? "");
  const amountEth = String(input.amountEth ?? "");
  const result = await sendEth(ctx.wallet, toAddress, amountEth);
  return {
    content: `Sent ${result.amountEth} ETH to ${result.to} on Base Sepolia. Tx: ${result.txHash}`,
    isError: false,
  };
}

function toolCheckInbox(ctx: ToolContext): ToolResult {
  const unread = ctx.inbox.unread();
  const formatted = unread
    .map((m) => {
      const body = m.peerTrusted ? m.body : tagUntrusted(`inbox:${m.peerId}`, m.body);
      ctx.inbox.markRead(m.id);
      return `From ${m.peerId} (${m.peerTrusted ? "trusted" : "untrusted"}): ${m.subject ?? ""}\n${body}`;
    })
    .join("\n\n");
  return { content: formatted || "(no unread messages)", isError: false };
}

function toolSendInboxMessage(
  ctx: ToolContext,
  input: Record<string, unknown>,
): ToolResult {
  const peerId = String(input.peerId ?? "");
  const body = String(input.body ?? "");
  const subject = input.subject ? String(input.subject) : undefined;
  ctx.inbox.send(peerId, body, subject);
  return { content: `Message sent to ${peerId}.`, isError: false };
}

function toolListSkills(ctx: ToolContext): ToolResult {
  const skills = ctx.skills.list();
  return {
    content:
      skills
        .map((s) => `${s.manifest.name}@${s.manifest.version}: ${s.manifest.description}`)
        .join("\n") || "(no skills loaded)",
    isError: false,
  };
}

async function toolSpawnChild(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const result = await spawnChild(ctx.conway, {
    name: String(input.name ?? ""),
    genesisPrompt: String(input.genesisPrompt ?? ""),
    fundingCredits: Number(input.fundingCredits ?? 0),
    fundingEth: input.fundingEth ? String(input.fundingEth) : undefined,
    parentId: ctx.wallet.address,
    parentGeneration: ctx.config.generation,
    parentWallet: ctx.wallet,
  });
  return {
    content: `Spawned child ${result.child.childId} (wallet ${result.child.childWalletAddress}) in sandbox ${result.sandboxId}, generation ${result.child.generation}.`,
    isError: false,
  };
}

async function toolRegisterIdentity(ctx: ToolContext): Promise<ToolResult> {
  const cardPath = writeAgentCard(ctx.config);
  const card = buildAgentCard(ctx.config);
  const result = await registerOnChainIdentity(ctx.wallet, cardPath);
  if (!result.registered) {
    return { content: `Registration skipped: ${result.reason}. Agent card written to ${cardPath}.`, isError: false };
  }
  return {
    content: `Registered on-chain identity for ${card.address}. Tx: ${result.txHash}`,
    isError: false,
  };
}
