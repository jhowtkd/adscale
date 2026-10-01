import { describe, expect, it } from "vitest";
import { DIAGNOSIS_POLL_MS, DIAGNOSIS_POLL_WINDOW_MS, threadAwaitsDiagnosis } from "./diagnosis-pending";

const NOW = new Date("2026-10-01T12:00:00.000Z").getTime();
const ago = (ms: number) => new Date(NOW - ms);
type Message = Parameters<typeof threadAwaitsDiagnosis>[0] extends (infer M)[] | undefined ? M : never;
const done = (createdAt: Date | string = ago(1_000)): Message => ({ type: "assistant", payload: { handoffStep: "done" }, createdAt });
const started = (createdAt: Date | string = ago(1_000)): Message => ({ type: "equipe_event", payload: { kind: "diagnosis.started" }, createdAt });
const retry = (createdAt: Date | string = ago(1_000)): Message => ({ type: "assistant", payload: { diagnosis: "pending" }, createdAt });
const card = (status: "ready" | "insufficient" | "failed", createdAt: Date | string = ago(500)): Message => ({ type: "equipe_card", payload: { kind: "diagnosis", status }, createdAt });
const user = (): Message => ({ type: "user", payload: {}, createdAt: ago(100) });

describe("threadAwaitsDiagnosis", () => {
  it("polls every 3 seconds, for at most 15 minutes after the marker", () => {
    expect(DIAGNOSIS_POLL_MS).toBe(3_000);
    expect(DIAGNOSIS_POLL_WINDOW_MS).toBe(15 * 60_000);
  });

  it("is false without messages", () => {
    expect(threadAwaitsDiagnosis(undefined, NOW)).toBe(false);
    expect(threadAwaitsDiagnosis([], NOW)).toBe(false);
  });

  it("is true right after the handoff is confirmed (the 'done' message)", () => {
    expect(threadAwaitsDiagnosis([done()], NOW)).toBe(true);
  });

  it("is true while the 'building' line is the last marker", () => {
    expect(threadAwaitsDiagnosis([done(ago(5_000)), started()], NOW)).toBe(true);
    expect(threadAwaitsDiagnosis([started()], NOW)).toBe(true);
  });

  it.each(["ready", "insufficient", "failed"] as const)("is false once a %s diagnosis card came after the marker", (status) => {
    expect(threadAwaitsDiagnosis([done(ago(5_000)), card(status)], NOW)).toBe(false);
    expect(threadAwaitsDiagnosis([done(ago(5_000)), started(ago(4_000)), card(status)], NOW)).toBe(false);
  });

  it("a retry in flight (assistant message with diagnosis:'pending') after a failed card is pending again", () => {
    expect(threadAwaitsDiagnosis([done(ago(60_000)), started(ago(50_000)), card("failed", ago(40_000)), retry(ago(1_000))], NOW)).toBe(true);
    // and the new card ends it
    expect(threadAwaitsDiagnosis([done(ago(60_000)), card("failed", ago(40_000)), retry(ago(10_000)), card("ready", ago(500))], NOW)).toBe(false);
  });

  it("a new 'done' after a card (the source-correction flow) is pending again", () => {
    expect(threadAwaitsDiagnosis([done(ago(120_000)), card("insufficient", ago(100_000)), done(ago(2_000))], NOW)).toBe(true);
  });

  it("unrelated messages around the marker change nothing", () => {
    expect(threadAwaitsDiagnosis([user(), done(), user()], NOW)).toBe(true);
    expect(threadAwaitsDiagnosis([user(), { type: "assistant", payload: {}, createdAt: ago(100) }], NOW)).toBe(false);
    expect(threadAwaitsDiagnosis([{ type: "equipe_card", payload: { kind: "handoff" }, createdAt: ago(100) }], NOW)).toBe(false);
    expect(threadAwaitsDiagnosis([{ type: "equipe_event", payload: { kind: "handoff.decided" }, createdAt: ago(100) }], NOW)).toBe(false);
    expect(threadAwaitsDiagnosis([{ type: "assistant", payload: { diagnosis: "ready" }, createdAt: ago(100) }], NOW)).toBe(false);
  });

  it("an old marker stops the polling: exactly 15 minutes is out, one millisecond less is in", () => {
    expect(threadAwaitsDiagnosis([done(ago(DIAGNOSIS_POLL_WINDOW_MS - 1))], NOW)).toBe(true);
    expect(threadAwaitsDiagnosis([done(ago(DIAGNOSIS_POLL_WINDOW_MS))], NOW)).toBe(false);
    expect(threadAwaitsDiagnosis([done(ago(DIAGNOSIS_POLL_WINDOW_MS + 60_000))], NOW)).toBe(false);
  });

  it("the window counts from the LAST marker", () => {
    expect(threadAwaitsDiagnosis([done(ago(DIAGNOSIS_POLL_WINDOW_MS * 2)), started(ago(1_000))], NOW)).toBe(true);
    expect(threadAwaitsDiagnosis([done(ago(1_000)), started(ago(DIAGNOSIS_POLL_WINDOW_MS + 1))], NOW)).toBe(false);
  });

  it("an invalid createdAt counts as 'now' (still pending)", () => {
    expect(threadAwaitsDiagnosis([done("not-a-date")], NOW)).toBe(true);
  });

  it("accepts createdAt as an ISO string or a Date", () => {
    expect(threadAwaitsDiagnosis([done(ago(1_000).toISOString())], NOW)).toBe(true);
    expect(threadAwaitsDiagnosis([done(ago(DIAGNOSIS_POLL_WINDOW_MS + 1).toISOString())], NOW)).toBe(false);
  });

  it("uses the current time by default", () => {
    expect(threadAwaitsDiagnosis([done(new Date())])).toBe(true);
    expect(threadAwaitsDiagnosis([done(new Date(Date.now() - DIAGNOSIS_POLL_WINDOW_MS - 1_000))])).toBe(false);
  });
});
