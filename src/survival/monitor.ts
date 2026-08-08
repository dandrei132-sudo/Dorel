import type { ConwayClient, SurvivalTier } from "../conway/types.js";
import { heartbeatCronForTier, modelForTier, tierForBalance } from "./tiers.js";

export interface SurvivalStatus {
  credits: number;
  tier: SurvivalTier;
  model: string;
  heartbeatCron: string;
}

export class SurvivalMonitor {
  private lastStatus: SurvivalStatus | null = null;

  constructor(private readonly conway: ConwayClient) {}

  async check(): Promise<SurvivalStatus> {
    const { credits } = await this.conway.getCredits();
    const tier = tierForBalance(credits);
    const status: SurvivalStatus = {
      credits,
      tier,
      model: modelForTier(tier),
      heartbeatCron: heartbeatCronForTier(tier),
    };
    this.lastStatus = status;
    return status;
  }

  get current(): SurvivalStatus | null {
    return this.lastStatus;
  }
}
