import { createServer, type Server } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { PATHS, env, type AgentConfig } from "../config.js";
import type { AgentLoop } from "../agent/loop.js";
import {
  executeApprovedRegistration,
  executeApprovedSpawn,
  executeApprovedTransfer,
  type ToolContext,
} from "../agent/tools.js";
import { getById, list, resolve as resolvePendingAction } from "../agent/pending-actions.js";
import type { ConwayClient } from "../conway/types.js";
import type { HeartbeatDaemon } from "../heartbeat/daemon.js";
import { getBalanceEth } from "../identity/provider.js";
import { listChildren } from "../replication/lineage.js";
import type { SkillRegistry } from "../skills/registry.js";
import { SurvivalMonitor } from "../survival/monitor.js";
import {
  loadOrCreateWebAuthState,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from "./auth.js";

const PUBLIC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public",
);
const SESSION_COOKIE = "automaton_session";

export interface WebServerDeps {
  config: AgentConfig;
  conway: ConwayClient;
  skills: SkillRegistry;
  heartbeat: HeartbeatDaemon;
  loop: AgentLoop;
}

export interface WebServerHandle {
  server: Server;
  generatedPassword: string | null;
  stop: () => Promise<void>;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function readLogTail(n: number): string[] {
  if (!existsSync(PATHS.logFile)) return [];
  return readFileSync(PATHS.logFile, "utf-8").split("\n").filter(Boolean).slice(-n);
}

/**
 * Starts the web control panel: a password-gated Express + WebSocket API
 * (see src/web/auth.ts for the session model) serving the static PWA in
 * /public, plus /api routes for status, chat, and — critically — the
 * pending-action approval queue that gates every irreversible/financial
 * tool call (see src/agent/pending-actions.ts and src/agent/tools.ts).
 * Binds to 127.0.0.1 for local/dev runs, or 0.0.0.0 automatically when a
 * platform-assigned PORT is detected (see src/config.ts) — a hosting
 * platform's own TLS-terminating edge/load balancer sits in front of this
 * in production, so the app itself only ever needs to speak plain HTTP.
 */
export function startWebServer(deps: WebServerDeps): WebServerHandle {
  const { state: authState, generatedPassword } = loadOrCreateWebAuthState();
  const toolCtx = deps.loop.getToolContext();
  const monitor = new SurvivalMonitor(deps.conway);

  const app = express();
  app.use(express.json());
  app.use(express.static(PUBLIC_DIR));

  const wsClients = new Set<WebSocket>();
  function broadcast(event: unknown): void {
    const payload = JSON.stringify(event);
    for (const client of wsClients) {
      if (client.readyState === client.OPEN) client.send(payload);
    }
  }

  // Unauthenticated on purpose: hosting platforms probe this for liveness
  // and never carry a session cookie. Reports process uptime only — no
  // agent state, credits, or identity, since that's not for a prober.
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true, uptimeSeconds: Math.round(process.uptime()) });
  });

  app.post("/api/login", (req: Request, res: Response) => {
    const password = String(req.body?.password ?? "");
    if (!verifyPassword(password, authState)) {
      res.status(401).json({ error: "Invalid password" });
      return;
    }
    const token = signSessionToken(authState);
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 60 * 60}`,
    );
    res.json({ ok: true });
  });

  function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE];
    if (!token || !verifySessionToken(token, authState)) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    next();
  }

  const api = express.Router();
  api.use(requireAuth);

  api.get("/status", async (_req, res) => {
    const survival = await monitor.check();
    const balanceEth = await getBalanceEth(toolCtx.wallet.address);
    res.json({
      config: deps.config,
      survival,
      walletBalanceEth: balanceEth,
    });
  });

  api.get("/soul", (_req, res) => {
    const content = existsSync(PATHS.soul) ? readFileSync(PATHS.soul, "utf-8") : "";
    res.json({ content });
  });

  api.get("/lineage", (_req, res) => {
    res.json({ children: listChildren(toolCtx.wallet.address) });
  });

  api.get("/inbox", (_req, res) => {
    res.json({ messages: toolCtx.inbox.history() });
  });

  api.get("/skills", (_req, res) => {
    res.json({ skills: deps.skills.list().map((s) => s.manifest) });
  });

  api.get("/logs", (req, res) => {
    const tail = Number.parseInt(String(req.query.tail ?? "50"), 10) || 50;
    res.json({ lines: readLogTail(tail) });
  });

  api.get("/pending-actions", (req, res) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    res.json({
      actions: list(status as Parameters<typeof list>[0]),
    });
  });

  api.post("/pending-actions/:id/approve", async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const action = getById(id);
    if (!action || action.status !== "pending") {
      res.status(404).json({ error: "No such pending action" });
      return;
    }
    try {
      const result = await executeApprovedAction(toolCtx, action.toolName, action.input);
      const updated = resolvePendingAction(id, "executed", result);
      broadcast({ type: "pending-action-updated", action: updated });
      res.json({ action: updated });
    } catch (err) {
      const updated = resolvePendingAction(id, "failed", { error: (err as Error).message });
      broadcast({ type: "pending-action-updated", action: updated });
      res.status(500).json({ action: updated });
    }
  });

  api.post("/pending-actions/:id/reject", (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const action = getById(id);
    if (!action || action.status !== "pending") {
      res.status(404).json({ error: "No such pending action" });
      return;
    }
    const updated = resolvePendingAction(id, "rejected");
    broadcast({ type: "pending-action-updated", action: updated });
    res.json({ action: updated });
  });

  api.post("/chat", async (req, res) => {
    const message = String(req.body?.message ?? "");
    if (!message.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }
    const reply = await deps.loop.runTurn(message);
    broadcast({ type: "chat", message, reply });
    res.json({ reply });
  });

  api.post("/control/stop", (_req, res) => {
    deps.heartbeat.stop();
    broadcast({ type: "control", running: false });
    res.json({ running: false });
  });

  api.post("/control/start", async (_req, res) => {
    await deps.heartbeat.start();
    broadcast({ type: "control", running: true });
    res.json({ running: true });
  });

  app.use("/api", api);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  });

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  wss.on("connection", (ws, req) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE];
    if (!token || !verifySessionToken(token, authState)) {
      ws.close(4401, "unauthorized");
      return;
    }
    wsClients.add(ws);
    ws.on("close", () => wsClients.delete(ws));
  });

  const pushInterval = setInterval(() => {
    void monitor.check().then((survival) => broadcast({ type: "status", survival }));
  }, 5000);

  httpServer.listen(env.WEB_UI_PORT, env.WEB_UI_HOST);

  return {
    server: httpServer,
    generatedPassword,
    stop: () =>
      new Promise((resolvePromise) => {
        clearInterval(pushInterval);
        wss.close();
        httpServer.close(() => resolvePromise());
      }),
  };
}

async function executeApprovedAction(
  ctx: ToolContext,
  toolName: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (toolName) {
    case "send_testnet_transfer":
      return executeApprovedTransfer(ctx, input);
    case "spawn_child":
      return executeApprovedSpawn(ctx, input);
    case "register_onchain_identity":
      return executeApprovedRegistration(ctx);
    default:
      throw new Error(`Unknown pending action tool: ${toolName}`);
  }
}
