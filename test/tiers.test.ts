import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS, heartbeatCronForTier, modelForTier, tierForBalance } from "../src/survival/tiers.js";

describe("tierForBalance", () => {
  it("is dead at zero or negative credits", () => {
    expect(tierForBalance(0)).toBe("dead");
    expect(tierForBalance(-5)).toBe("dead");
  });

  it("is critical just above the dead threshold", () => {
    expect(tierForBalance(0.01)).toBe("critical");
    expect(tierForBalance(DEFAULT_THRESHOLDS.lowCompute)).toBe("critical");
  });

  it("is low_compute between lowCompute and normal thresholds", () => {
    expect(tierForBalance(DEFAULT_THRESHOLDS.lowCompute + 0.01)).toBe("low_compute");
    expect(tierForBalance(DEFAULT_THRESHOLDS.normal)).toBe("low_compute");
  });

  it("is normal above the normal threshold", () => {
    expect(tierForBalance(DEFAULT_THRESHOLDS.normal + 0.01)).toBe("normal");
    expect(tierForBalance(1000)).toBe("normal");
  });

  it("respects custom thresholds", () => {
    const custom = { normal: 100, lowCompute: 50, critical: 10 };
    expect(tierForBalance(10, custom)).toBe("dead");
    expect(tierForBalance(20, custom)).toBe("critical");
    expect(tierForBalance(60, custom)).toBe("low_compute");
    expect(tierForBalance(200, custom)).toBe("normal");
  });
});

describe("modelForTier / heartbeatCronForTier", () => {
  it("returns a defined model and cron expression for every tier", () => {
    for (const tier of ["normal", "low_compute", "critical", "dead"] as const) {
      expect(typeof modelForTier(tier)).toBe("string");
      expect(typeof heartbeatCronForTier(tier)).toBe("string");
    }
  });
});
