import { DomainError } from "../domain.js";

export class SlidingWindowRateLimiter {
  private readonly windows = new Map<string, number[]>();

  assert(key: string, maximum: number, windowMs = 60_000): void {
    const now = Date.now();
    const cutoff = now - windowMs;
    const prior = (this.windows.get(key) ?? []).filter((time) => time > cutoff);
    if (prior.length >= maximum) throw new DomainError("RATE_LIMITED", "请求过于频繁，请稍后再试", 429);
    prior.push(now);
    this.windows.set(key, prior);
  }
}
