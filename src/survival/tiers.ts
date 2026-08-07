import type { SurvivalTier } from "../conway/types.js";

export interface TierThresholds {
  normal: number;
  lowCompute: number;
  critical: number;
}

export const DEFAULT_THRESHOLDS: TierThresholds = {
  normal: 10,
  lowCompute: 2,
  critical: 0,
};

export const TIER_MODELS: Record<SurvivalTier, string> = {
  normal: "claude-sonnet-5",
  low_compute: "claude-haiku-4-5-20251001",
  critical: "claude-haiku-4-5-20251001",
  dead: "claude-haiku-4-5-20251001",
};

export const TIER_HEARTBEAT_CRON: Record<SurvivalTier, string> = {
  normal: "*/5 * * * *",
  low_compute: "*/15 * * * *",
  critical: "0 * * * *",
  dead: "0 0 * * 0",
};

/**
 * Pure mapping from credit balance to survival tier. Kept side-effect free
 * and independent of any I/O so it's directly unit-testable.
 */
export function tierForBalance(
  credits: number,
  thresholds: TierThresholds = DEFAULT_THRESHOLDS,
): SurvivalTier {
  if (credits <= thresholds.critical) return "dead";
  if (credits <= thresholds.lowCompute) return "critical";
  if (credits <= thresholds.normal) return "low_compute";
  return "normal";
}

export function modelForTier(tier: SurvivalTier): string {
  return TIER_MODELS[tier];
}

export function heartbeatCronForTier(tier: SurvivalTier): string {
  return TIER_HEARTBEAT_CRON[tier];
}
