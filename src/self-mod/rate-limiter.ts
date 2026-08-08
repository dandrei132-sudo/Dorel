/**
 * Caps how many self-modifications the agent can make in a rolling time
 * window, so a reasoning loop that gets stuck editing its own source can't
 * runaway-spiral through unbounded changes before a human notices.
 */
export class RateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly maxEvents: number,
    private readonly windowMs: number,
  ) {}

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    this.timestamps = this.timestamps.filter((ts) => ts > cutoff);
  }

  tryAcquire(now: number = Date.now()): boolean {
    this.prune(now);
    if (this.timestamps.length >= this.maxEvents) return false;
    this.timestamps.push(now);
    return true;
  }

  remaining(now: number = Date.now()): number {
    this.prune(now);
    return Math.max(0, this.maxEvents - this.timestamps.length);
  }
}

export const selfModRateLimiter = new RateLimiter(10, 60 * 60 * 1000);
