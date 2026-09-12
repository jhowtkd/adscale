import { describe, expect, it } from "vitest";
import {
  canFinalizeAttempt,
  isAttemptUsable,
  preparationInputFingerprint,
} from "./preparation-attempt";

const now = new Date("2026-09-12T12:00:00.000Z");

describe("preparationInputFingerprint", () => {
  it("e estavel sob reordenacao de chaves", () => {
    expect(preparationInputFingerprint({ a: 1, b: [2, 3] }))
      .toBe(preparationInputFingerprint({ b: [2, 3], a: 1 }));
  });

  it("muda quando uma entrada muda", () => {
    expect(preparationInputFingerprint({ a: 1 }))
      .not.toBe(preparationInputFingerprint({ a: 2 }));
  });
});

describe("isAttemptUsable", () => {
  it("aceita running com lease no futuro", () => {
    expect(isAttemptUsable(
      { state: "running", leaseExpiresAt: "2026-09-12T12:00:30.000Z" },
      now,
    )).toBe(true);
  });

  it("recusa running com lease expirado", () => {
    expect(isAttemptUsable(
      { state: "running", leaseExpiresAt: "2026-09-12T11:59:59.000Z" },
      now,
    )).toBe(false);
  });

  it("recusa qualquer estado terminal", () => {
    for (const state of ["completed", "failed", "invalidated"] as const) {
      expect(isAttemptUsable(
        { state, leaseExpiresAt: "2026-09-12T12:00:30.000Z" },
        now,
      )).toBe(false);
    }
  });
});

describe("canFinalizeAttempt", () => {
  const base = {
    id: "attempt-1",
    state: "running" as const,
    inputRevision: "2026-09-12T11:59:00.000Z",
    inputFingerprint: "fp-1",
    leaseExpiresAt: "2026-09-12T12:00:30.000Z",
  };

  it("aceita o dono com revisao e fingerprint intactos", () => {
    expect(canFinalizeAttempt({
      attempt: base,
      finalizingAttemptId: "attempt-1",
      currentRevision: "2026-09-12T11:59:00.000Z",
      currentFingerprint: "fp-1",
      now,
    })).toEqual({ ok: true });
  });

  it("recusa uma tentativa antiga que tenta substituir a nova", () => {
    expect(canFinalizeAttempt({
      attempt: base,
      finalizingAttemptId: "attempt-0",
      currentRevision: "2026-09-12T11:59:00.000Z",
      currentFingerprint: "fp-1",
      now,
    })).toEqual({ ok: false, reason: "not_owner" });
  });

  it("recusa quando a revisao mudou durante a chamada externa", () => {
    expect(canFinalizeAttempt({
      attempt: base,
      finalizingAttemptId: "attempt-1",
      currentRevision: "2026-09-12T11:59:30.000Z",
      currentFingerprint: "fp-1",
      now,
    })).toEqual({ ok: false, reason: "revision_changed" });
  });

  it("recusa quando o fingerprint mudou", () => {
    expect(canFinalizeAttempt({
      attempt: base,
      finalizingAttemptId: "attempt-1",
      currentRevision: "2026-09-12T11:59:00.000Z",
      currentFingerprint: "fp-2",
      now,
    })).toEqual({ ok: false, reason: "fingerprint_changed" });
  });

  it("recusa conclusao tardia apos o lease expirar", () => {
    expect(canFinalizeAttempt({
      attempt: { ...base, leaseExpiresAt: "2026-09-12T11:59:59.000Z" },
      finalizingAttemptId: "attempt-1",
      currentRevision: "2026-09-12T11:59:00.000Z",
      currentFingerprint: "fp-1",
      now,
    })).toEqual({ ok: false, reason: "lease_expired" });
  });
});
