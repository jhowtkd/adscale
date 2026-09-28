import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { getRoundDetail } from "./calibration-queries";
import { itemVersionHash } from "./item-shared";
import {
  closeTestRound,
  ctx,
  openTestRound,
  scoreAll,
  setNow,
  setupCalibration,
} from "./testing/calibration";
import { seedWork, uuid } from "./testing/items";

describe("submit_corrected_version", () => {
  it("submits one corrected version, links it and re-queues quality", async () => {
    const { t, ids } = await setupCalibration();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "score_attempt",
      payload: {
        roundId: round.roundId,
        itemId,
        facts: 4,
        brand: 4,
        usefulness: 2,
        execution: 4,
      },
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "return_item_for_fix",
      payload: { roundId: round.roundId, itemId, note: "fix the price" },
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "submit_corrected_version",
      payload: { roundId: round.roundId, itemId, caption: "fixed caption" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({
      itemId,
      previousVersionHash: round.versionHashes[0],
    });
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "round.item_corrected",
      "notification.requested",
    ]);
    expect(outcome.value.events[0]?.payload).toMatchObject({
      itemId,
      previousVersionHash: round.versionHashes[0],
    });
    expect(outcome.value.events[1]?.payload).toMatchObject({
      recipientRole: "quality",
      templateKey: "round.correction_submitted",
    });
    const versionHash = outcome.value.data.versionHash as string;
    expect(versionHash).not.toBe(round.versionHashes[0]);
    // Same hashing as the batch flow, authored by the agent.
    const versions = await t.deps.uow.repos.itemVersions.list(scope, { itemId });
    expect(versions).toHaveLength(2);
    const corrected = versions.find((v) => v.versionHash === versionHash);
    const attempt = versions.find((v) => v.versionHash === round.versionHashes[0]);
    expect(corrected).toMatchObject({
      caption: "fixed caption",
      creativeWorkOutputId: attempt?.creativeWorkOutputId,
      authorRole: "agent",
    });
    expect(
      itemVersionHash({
        output: corrected!.creativeWorkOutputId,
        caption: corrected!.caption,
        destination: corrected!.destination ?? "",
        scheduledFor: corrected!.scheduledFor,
      }),
    ).toBe(versionHash);
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.currentVersionHash).toBe(versionHash);
    // The evaluated attempt stays the FIRST version; the note does not move.
    const scores = await t.deps.uow.repos.calibrationScores.list(scope);
    expect(scores).toHaveLength(1);
    expect(scores[0]).toMatchObject({ versionHash: round.versionHashes[0], verdict: "fail" });
    const detail = await getRoundDetail(
      t.deps.uow.repos,
      t.deps.uow.internal,
      ids.workspaceId,
      ids.accountId,
      round.roundId,
    );
    const entry = detail?.items.find((e) => e.item.id === itemId);
    expect(entry?.evaluatedAttempt?.versionHash).toBe(round.versionHashes[0]);
    expect(entry?.quality.corrected).toEqual({ versionHash });
    // Back in the quality queue: the corrected version releases.
    const released = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_item_to_client",
      payload: { roundId: round.roundId, itemId },
    });
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    expect(released.value.data).toMatchObject({ versionHash, corrected: true });
  });

  it("accepts a visual correction with a new output of the same work", async () => {
    const { t, ids } = await setupCalibration();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    await scoreAll(t, ids, round.roundId, [itemId]);
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "return_item_for_fix",
      payload: { roundId: round.roundId, itemId, note: "wrong image" },
    });
    const item = await t.deps.uow.repos.items.get(scope, itemId);
    const outputId = uuid();
    t.gateway.addOutput({ id: outputId, workspaceId: ids.workspaceId, workId: item!.creativeWorkId! });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "submit_corrected_version",
      payload: { roundId: round.roundId, itemId, creativeWorkOutputId: outputId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const versions = await t.deps.uow.repos.itemVersions.list(scope, { itemId });
    expect(
      versions.find((v) => v.versionHash === outcome.value.data.versionHash),
    ).toMatchObject({ creativeWorkOutputId: outputId });
  });

  it("refuses without a return, twice, after release, and on closed rounds", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const [plainId, twiceId, releasedId, closedId] = round.itemIds;
    await scoreAll(t, ids, round.roundId, round.itemIds);
    const noReturn = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "submit_corrected_version",
      payload: { roundId: round.roundId, itemId: plainId!, caption: "unsolicited" },
    });
    expect(noReturn.ok).toBe(false);
    if (noReturn.ok) return;
    expect(noReturn.error.code).toBe("no_return");
    for (const itemId of [twiceId!, releasedId!, closedId!]) {
      await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
        type: "return_item_for_fix",
        payload: { roundId: round.roundId, itemId, note: "fix" },
      });
    }
    const first = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "submit_corrected_version",
      payload: { roundId: round.roundId, itemId: twiceId!, caption: "fixed" },
    });
    expect(first.ok).toBe(true);
    const again = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "submit_corrected_version",
      payload: { roundId: round.roundId, itemId: twiceId!, caption: "fixed again" },
    });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe("already_corrected");
    await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "submit_corrected_version",
      payload: { roundId: round.roundId, itemId: releasedId!, caption: "fixed" },
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_item_to_client",
      payload: { roundId: round.roundId, itemId: releasedId! },
    });
    const late = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "submit_corrected_version",
      payload: { roundId: round.roundId, itemId: releasedId!, caption: "too late" },
    });
    expect(late.ok).toBe(false);
    if (late.ok) return;
    expect(late.error.code).toBe("already_released");
    await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "submit_corrected_version",
      payload: { roundId: round.roundId, itemId: closedId!, caption: "fixed" },
    });
    await closeTestRound(t, ids, round.roundId);
    const closed = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "submit_corrected_version",
      payload: { roundId: round.roundId, itemId: closedId!, caption: "after close" },
    });
    expect(closed.ok).toBe(false);
    if (closed.ok) return;
    expect(closed.error.code).toBe("round_closed");
  });

  it("refuses critical and withdrawn items, identical versions and bad outputs", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const [criticalId, withdrawnId, sameId, foreignId] = round.itemIds;
    await scoreAll(t, ids, round.roundId, round.itemIds);
    for (const itemId of round.itemIds) {
      await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
        type: "return_item_for_fix",
        payload: { roundId: round.roundId, itemId: itemId!, note: "fix" },
      });
    }
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "mark_critical_failure",
      payload: { roundId: round.roundId, itemId: criticalId!, reason: "invented price" },
    });
    const critical = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "submit_corrected_version",
      payload: { roundId: round.roundId, itemId: criticalId!, caption: "fixed" },
    });
    expect(critical.ok).toBe(false);
    if (critical.ok) return;
    expect(critical.error.code).toBe("item_critical");
    await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "submit_corrected_version",
      payload: { roundId: round.roundId, itemId: withdrawnId!, caption: "still off" },
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "withdraw_round_item",
      payload: { roundId: round.roundId, itemId: withdrawnId! },
    });
    const withdrawn = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "submit_corrected_version",
      payload: { roundId: round.roundId, itemId: withdrawnId!, caption: "after withdrawal" },
    });
    expect(withdrawn.ok).toBe(false);
    if (withdrawn.ok) return;
    expect(withdrawn.error.code).toBe("item_withdrawn");
    const same = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "submit_corrected_version",
      payload: { roundId: round.roundId, itemId: sameId!, caption: "post 3" },
    });
    expect(same.ok).toBe(false);
    if (same.ok) return;
    expect(same.error.code).toBe("no_change");
    const foreign = seedWork(t, uuid());
    const unknownOutput = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "submit_corrected_version",
      payload: { roundId: round.roundId, itemId: foreignId!, creativeWorkOutputId: foreign.outputId },
    });
    expect(unknownOutput.ok).toBe(false);
    if (unknownOutput.ok) return;
    expect(unknownOutput.error.code).toBe("unknown_creative_output");
    // An output of another work in the same workspace does not belong here.
    await closeTestRound(t, ids, round.roundId);
    setNow(t, new Date("2026-10-12T14:00:00.000Z"));
    const next = await openTestRound(t, ids);
    const itemId = next.itemIds[0]!;
    await scoreAll(t, ids, next.roundId, [itemId]);
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "return_item_for_fix",
      payload: { roundId: next.roundId, itemId, note: "fix" },
    });
    const other = seedWork(t, ids.workspaceId);
    const mismatch = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "submit_corrected_version",
      payload: { roundId: next.roundId, itemId, creativeWorkOutputId: other.outputId },
    });
    expect(mismatch.ok).toBe(false);
    if (mismatch.ok) return;
    expect(mismatch.error.code).toBe("output_work_mismatch");
  });

  it("is agent-only and needs a caption or an output", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    await scoreAll(t, ids, round.roundId, [itemId]);
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "return_item_for_fix",
      payload: { roundId: round.roundId, itemId, note: "fix" },
    });
    for (const actor of [ids.actors.quality, ids.actors.system, ids.actors.approver]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), {
        type: "submit_corrected_version",
        payload: { roundId: round.roundId, itemId, caption: "fixed" },
      });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.error.code).toBe("forbidden_actor");
    }
    const empty = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "submit_corrected_version",
      payload: { roundId: round.roundId, itemId },
    });
    expect(empty.ok).toBe(false);
    if (empty.ok) return;
    expect(empty.error.code).toBe("invalid_command");
  });
});
