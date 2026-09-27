import { describe, expect, it } from "vitest";
import type { Actor } from "./actors";
import { applyPause, createPause, effectivePauseLevel, resumePause, type Pause } from "./pause";

const approver: Actor = { kind: "client_person", role: "approver", personId: "ana" };
const member: Actor = { kind: "client_person", role: "member", personId: "rui" };
const quality: Actor = { kind: "staff", role: "quality", staffId: "q1" };
const operations: Actor = { kind: "staff", role: "operations", staffId: "o1" };
const bruna: Actor = { kind: "staff", role: "support", staffId: "bruna" };
const otherSupport: Actor = { kind: "staff", role: "support", staffId: "caio" };
const system: Actor = { kind: "system", job: "reconciler" };

const AT = new Date("2026-10-30T15:00:00.000Z");

function pause(origin: Pause["origin"], id = `p-${origin}`): Pause {
  return createPause({ id, origin, scope: "account", pausedBy: "someone", pausedAt: AT });
}

describe("stacking", () => {
  it("derives the level from the origin", () => {
    expect(pause("client").level).toBe("publication");
    expect(pause("security").level).toBe("execution");
    expect(pause("delinquency").level).toBe("delinquency");
  });

  it("stacks pauses and lets the most restrictive win", () => {
    const first = applyPause([], pause("client"));
    if (!first.ok) throw new Error("setup failed");
    expect(effectivePauseLevel(first.value)).toBe("publication");
    const second = applyPause(first.value, pause("delinquency"));
    if (!second.ok) throw new Error("setup failed");
    expect(effectivePauseLevel(second.value)).toBe("delinquency");
    const third = applyPause(second.value, pause("security"));
    if (!third.ok) throw new Error("setup failed");
    expect(effectivePauseLevel(third.value)).toBe("execution");
  });

  it("rejects duplicate ids and reports no pause as null", () => {
    expect(effectivePauseLevel([])).toBeNull();
    const first = applyPause([], pause("client", "p1"));
    if (!first.ok) throw new Error("setup failed");
    expect(applyPause(first.value, pause("client", "p1")).ok).toBe(false);
  });

  it("keeps the scope paused until every pause is lifted", () => {
    const stacked = applyPause([], pause("client", "p1"));
    if (!stacked.ok) throw new Error("setup failed");
    const more = applyPause(stacked.value, pause("content_incident", "p2"));
    if (!more.ok) throw new Error("setup failed");
    const oneLifted = resumePause(more.value, "p1", approver);
    expect(oneLifted.ok).toBe(true);
    if (!oneLifted.ok) return;
    expect(effectivePauseLevel(oneLifted.value)).toBe("publication");
  });
});

describe("who may resume", () => {
  it("lets only the client resume their own pause", () => {
    const stacked = applyPause([], pause("client", "p1"));
    if (!stacked.ok) throw new Error("setup failed");
    expect(resumePause(stacked.value, "p1", member).ok).toBe(false);
    expect(resumePause(stacked.value, "p1", bruna).ok).toBe(false);
    const resumed = resumePause(stacked.value, "p1", approver);
    expect(resumed.ok).toBe(true);
    if (resumed.ok) expect(resumed.value).toEqual([]);
  });

  it("lets only the same staff member resume a team pause", () => {
    const team = createPause({ id: "p-team", origin: "team", scope: "account", pausedBy: "bruna", pausedAt: AT });
    const stacked = applyPause([], team);
    if (!stacked.ok) throw new Error("setup failed");
    expect(resumePause(stacked.value, "p-team", otherSupport).ok).toBe(false);
    expect(resumePause(stacked.value, "p-team", approver).ok).toBe(false);
    expect(resumePause(stacked.value, "p-team", bruna).ok).toBe(true);
  });

  it("lets only quality resume a content-incident pause", () => {
    const stacked = applyPause([], pause("content_incident", "p1"));
    if (!stacked.ok) throw new Error("setup failed");
    expect(resumePause(stacked.value, "p1", bruna).ok).toBe(false);
    expect(resumePause(stacked.value, "p1", quality).ok).toBe(true);
  });

  it("lets only operations resume the global stop and security suspensions", () => {
    const global = applyPause([], pause("global_stop", "p1"));
    if (!global.ok) throw new Error("setup failed");
    expect(resumePause(global.value, "p1", quality).ok).toBe(false);
    expect(resumePause(global.value, "p1", operations).ok).toBe(true);

    const security = applyPause([], pause("security", "p2"));
    if (!security.ok) throw new Error("setup failed");
    expect(resumePause(security.value, "p2", quality).ok).toBe(false);
    expect(resumePause(security.value, "p2", operations).ok).toBe(true);
  });

  it("resumes connection and delinquency pauses automatically (system only)", () => {
    const connection = applyPause([], pause("connection", "p1"));
    if (!connection.ok) throw new Error("setup failed");
    expect(resumePause(connection.value, "p1", operations).ok).toBe(false);
    expect(resumePause(connection.value, "p1", system).ok).toBe(true);

    const delinquency = applyPause([], pause("delinquency", "p2"));
    if (!delinquency.ok) throw new Error("setup failed");
    expect(resumePause(delinquency.value, "p2", bruna).ok).toBe(false);
    expect(resumePause(delinquency.value, "p2", system).ok).toBe(true);
  });

  it("rejects unknown pause ids", () => {
    expect(resumePause([], "missing", system).ok).toBe(false);
  });
});
