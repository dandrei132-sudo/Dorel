import cron, { type ScheduledTask } from "node-cron";
import type { ConwayClient } from "../conway/types.js";
import { SurvivalMonitor } from "../survival/monitor.js";
import { creditCheckTask, healthCheckTask, statusPingTask } from "./tasks.js";

/**
 * Runs scheduled tasks (health checks, credit monitoring, status pings)
 * independently of the main agent Think->Act->Observe loop, so survival
 * monitoring keeps ticking even while the agent loop is between turns.
 * The cron interval itself tightens/loosens with the survival tier
 * (normal -> every 5 min, low_compute -> 15 min, critical -> hourly).
 */
export class HeartbeatDaemon {
  private task: ScheduledTask | null = null;
  private currentCron: string | null = null;
  private readonly monitor: SurvivalMonitor;

  constructor(private readonly conway: ConwayClient) {
    this.monitor = new SurvivalMonitor(conway);
  }

  private async tick(): Promise<void> {
    await healthCheckTask();
    const status = await this.monitor.check();
    await creditCheckTask(this.monitor);
    await statusPingTask(this.conway);

    if (status.heartbeatCron !== this.currentCron) {
      this.reschedule(status.heartbeatCron);
    }
  }

  private reschedule(cronExpression: string): void {
    this.task?.stop();
    this.currentCron = cronExpression;
    this.task = cron.schedule(cronExpression, () => {
      void this.tick();
    });
  }

  async start(initialCron = "*/5 * * * *"): Promise<void> {
    this.reschedule(initialCron);
    await this.tick();
  }

  stop(): void {
    this.task?.stop();
    this.task = null;
  }

  getMonitor(): SurvivalMonitor {
    return this.monitor;
  }
}
