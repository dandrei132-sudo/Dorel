import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { PATHS } from "../config.js";
import type { ConwayClient } from "../conway/types.js";
import { SurvivalMonitor } from "../survival/monitor.js";

function log(line: string): void {
  mkdirSync(path.dirname(PATHS.logFile), { recursive: true });
  appendFileSync(PATHS.logFile, `[${new Date().toISOString()}] ${line}\n`);
}

export async function healthCheckTask(): Promise<void> {
  log("heartbeat: health check ok");
}

export async function creditCheckTask(monitor: SurvivalMonitor): Promise<void> {
  const status = await monitor.check();
  log(
    `heartbeat: credits=${status.credits.toFixed(4)} tier=${status.tier} model=${status.model}`,
  );
}

export async function statusPingTask(conway: ConwayClient): Promise<void> {
  const { credits, tier } = await conway.getCredits();
  log(`heartbeat: status ping credits=${credits.toFixed(4)} tier=${tier}`);
}
