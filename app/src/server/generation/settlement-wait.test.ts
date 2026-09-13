import { afterEach, describe, expect, it, vi } from "vitest";
import { settlementDeadline } from "./settlement-wait";

afterEach(() => vi.useRealTimers());

describe("settlementDeadline", () => {
  it("stops by monotonic time even when wall time moves backwards", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
    const deadline = settlementDeadline({ maxAttempts: 80, maxMs: 50 });
    vi.setSystemTime(new Date(0));
    let attempt = 0;
    const waiting = (async () => {
      while (deadline.shouldContinue(attempt)) { attempt++; await deadline.pause(); }
    })();
    await vi.runAllTimersAsync();
    await waiting;
    expect(attempt).toBe(2);
    expect(performance.now()).toBe(50);
  });

  it("stops at the attempt limit before the deadline", () => {
    const deadline = settlementDeadline({ maxAttempts: 3, maxMs: 60_000 });
    let attempt = 0;
    while (deadline.shouldContinue(attempt)) attempt++;
    expect(attempt).toBe(3);
  });

  it("bounds a hung read and preserves read errors", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const deadline = settlementDeadline({ maxAttempts: 80, maxMs: 50 });
    const pending = deadline.read(() => new Promise<never>(() => {}));
    const assertion = expect(pending).rejects.toThrow("settlement_read_timeout");
    await vi.runAllTimersAsync();
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
    const error = new Error("database unavailable");
    await expect(settlementDeadline({ maxAttempts: 80, maxMs: 50 }).read(() => Promise.reject(error))).rejects.toBe(error);
    expect(vi.getTimerCount()).toBe(0);
  });
});
