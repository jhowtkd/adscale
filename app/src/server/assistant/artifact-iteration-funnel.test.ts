import { describe, expect, it } from "vitest";
import { buildArtifactIterationFunnelSummary } from "./artifact-iteration-funnel";
import type { AssistantArtifactIterationEvent } from "@/server/db/schema";

function event(
  partial: Partial<AssistantArtifactIterationEvent> &
    Pick<AssistantArtifactIterationEvent, "eventKey" | "path" | "step">
): AssistantArtifactIterationEvent {
  return {
    id: partial.id ?? crypto.randomUUID(),
    workspaceId: partial.workspaceId ?? "ws-1",
    clientProfileId: partial.clientProfileId ?? "profile-1",
    threadId: partial.threadId ?? "thread-1",
    campaignId: partial.campaignId ?? null,
    actionRecordId: partial.actionRecordId ?? null,
    path: partial.path,
    step: partial.step,
    eventKey: partial.eventKey,
    reasonCode: partial.reasonCode ?? null,
    metadata: partial.metadata ?? {},
    occurredAt: partial.occurredAt ?? new Date("2026-06-26T12:00:00Z"),
    createdAt: partial.createdAt ?? new Date("2026-06-26T12:00:00Z"),
  };
}

describe("buildArtifactIterationFunnelSummary", () => {
  it("aggregates path funnel and marks insufficient sample", () => {
    const events = [
      event({
        threadId: "t1",
        path: "plan_iteration",
        step: "propose",
        eventKey: "proposal_created",
      }),
      event({
        threadId: "t1",
        path: "plan_iteration",
        step: "generate",
        eventKey: "generation_succeeded",
      }),
      event({
        threadId: "t2",
        path: "compare_approve",
        step: "compare",
        eventKey: "comparison_opened",
      }),
      event({
        threadId: "t2",
        path: "compare_approve",
        step: "promote",
        eventKey: "promotion_conflict",
        reasonCode: "head_conflict",
      }),
    ];

    const summary = buildArtifactIterationFunnelSummary(events);

    expect(summary.pathFunnel).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "plan_iteration",
          starts: 1,
          completions: 1,
          conflicts: 0,
        }),
        expect.objectContaining({
          path: "compare_approve",
          starts: 1,
          completions: 0,
          conflicts: 1,
        }),
      ])
    );
    expect(summary.operationalEvidence.sampleSufficient).toBe(false);
    expect(summary.investigationLinks).toHaveLength(2);
    expect(summary.topReasonCodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reasonCode: "head_conflict", count: 1 }),
      ])
    );
  });

  it("computes step drop-off between consecutive steps", () => {
    const events = [
      event({
        path: "plan_iteration",
        step: "propose",
        eventKey: "proposal_created",
      }),
      event({
        path: "plan_iteration",
        step: "propose",
        eventKey: "proposal_created",
      }),
      event({
        path: "plan_iteration",
        step: "confirm",
        eventKey: "proposal_confirmed",
      }),
    ];

    const summary = buildArtifactIterationFunnelSummary(events);
    const proposeRow = summary.stepDropoff.find(
      (row) => row.path === "plan_iteration" && row.step === "propose"
    );

    expect(proposeRow).toEqual(
      expect.objectContaining({ views: 2, dropoffs: 1 })
    );
  });
});
