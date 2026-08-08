// Mirrors src/survival/tiers.ts's threshold logic. Kept as a small,
// independent copy rather than a cross-package import so this CLI stays a
// standalone binary that only needs the running agent's on-disk state
// (state.db, config.json, wallet.json, logs) — the same contract a
// human operator would use to inspect any automaton, not just ones built
// from this exact source tree.
export type SurvivalTier = "normal" | "low_compute" | "critical" | "dead";

export function tierForBalance(credits: number): SurvivalTier {
  if (credits <= 0) return "dead";
  if (credits <= 2) return "critical";
  if (credits <= 10) return "low_compute";
  return "normal";
}
