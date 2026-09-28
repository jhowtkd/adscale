import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import {
  approveAll,
  closeTestRound,
  ctx,
  openTestRound,
  scoreAll,
  setupCalibration,
} from "./testing/calibration";

async function adjust(
  t: Parameters<typeof openTestRound>[0],
  ids: Parameters<typeof openTestRound>[1],
  itemId: string,
  category: "fact" | "brand" | "voice" | "visual" | "other",
) {
  const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
    type: "request_adjustment",
    payload: { itemId, category },
  });
  if (!outcome.ok) {
    throw new Error(`adjust failed: ${outcome.error.code} ${outcome.error.message}`);
  }
}

describe("classify_rejection", () => {
  it("tightens freely: client taste becomes brand without evidence", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    await adjust(t, ids, itemId, "voice");
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "classify_rejection",
      payload: { roundId: round.roundId, itemId, category: "brand" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toEqual({ itemId, from: "voice", to: "brand", loosened: false });
    expect(outcome.value.events.map((e) => e.eventType)).toEqual(["round.rejection_classified"]);
  });

  it("loosens only with recorded evidence", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    await adjust(t, ids, itemId, "fact");
    const bare = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "classify_rejection",
      payload: { roundId: round.roundId, itemId, category: "taste" },
    });
    expect(bare.ok).toBe(false);
    if (bare.ok) return;
    expect(bare.error.code).toBe("evidence_required");
    const blank = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "classify_rejection",
      payload: { roundId: round.roundId, itemId, category: "taste", evidence: "   " },
    });
    expect(blank.ok).toBe(false);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "classify_rejection",
      payload: {
        roundId: round.roundId,
        itemId,
        category: "taste",
        evidence: "catalog price matches the caption",
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toEqual({ itemId, from: "fact", to: "taste", loosened: true });
  });

  it("moves laterally for free and lets the latest classification win", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    await adjust(t, ids, itemId, "fact");
    const lateral = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "classify_rejection",
      payload: { roundId: round.roundId, itemId, category: "brand" },
    });
    expect(lateral.ok).toBe(true);
    const loosened = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "classify_rejection",
      payload: { roundId: round.roundId, itemId, category: "taste", evidence: "voice guide covers it" },
    });
    expect(loosened.ok).toBe(true);
    await scoreAll(t, ids, round.roundId, round.itemIds);
    const closed = await closeTestRound(t, ids, round.roundId);
    expect(closed.outcome).toBe("inconclusive");
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const saved = await t.deps.uow.repos.calibrationRounds.get(scope, round.roundId);
    const items = (saved?.decision as { items: Array<{ itemId: string; clientVerdict: string }> }).items;
    expect(items.find((entry) => entry.itemId === itemId)?.clientVerdict).toBe("taste_adjustment");
  });

  it("refuses without a client adjustment, after close, and for agents", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    const empty = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "classify_rejection",
      payload: { roundId: round.roundId, itemId, category: "taste" },
    });
    expect(empty.ok).toBe(false);
    if (empty.ok) return;
    expect(empty.error.code).toBe("nothing_to_classify");
    await adjust(t, ids, itemId, "brand");
    const agent = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "classify_rejection",
      payload: { roundId: round.roundId, itemId, category: "taste", evidence: "x" },
    });
    expect(agent.ok).toBe(false);
    if (agent.ok) return;
    expect(agent.error.code).toBe("forbidden_actor");
    await scoreAll(t, ids, round.roundId, round.itemIds);
    await approveAll(t, ids, round.itemIds.slice(1));
    await closeTestRound(t, ids, round.roundId);
    const late = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "classify_rejection",
      payload: { roundId: round.roundId, itemId, category: "taste", evidence: "x" },
    });
    expect(late.ok).toBe(false);
    if (late.ok) return;
    expect(late.error.code).toBe("round_closed");
  });
});

describe("classification at close", () => {
  it("a loosened rejection passes and shows up in the round summary", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    await scoreAll(t, ids, round.roundId, round.itemIds);
    await adjust(t, ids, round.itemIds[0]!, "fact");
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "classify_rejection",
      payload: {
        roundId: round.roundId,
        itemId: round.itemIds[0]!,
        category: "taste",
        evidence: "source shows the fact was right",
      },
    });
    await approveAll(t, ids, round.itemIds.slice(1));
    const closed = await closeTestRound(t, ids, round.roundId);
    expect(closed.outcome).toBe("passed");
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const saved = await t.deps.uow.repos.calibrationRounds.get(scope, round.roundId);
    expect(saved?.decision).toMatchObject({
      outcome: "passed",
      decisions: 4,
      loosenings: [
        {
          itemId: round.itemIds[0],
          from: "fact",
          to: "taste",
          evidence: "source shows the fact was right",
        },
      ],
    });
  });

  it("a tightened taste adjustment fails the round", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    await scoreAll(t, ids, round.roundId, round.itemIds);
    await adjust(t, ids, round.itemIds[0]!, "voice");
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "classify_rejection",
      payload: { roundId: round.roundId, itemId: round.itemIds[0]!, category: "brand" },
    });
    await approveAll(t, ids, round.itemIds.slice(1));
    const closed = await closeTestRound(t, ids, round.roundId);
    expect(closed.outcome).toBe("failed");
  });
});
