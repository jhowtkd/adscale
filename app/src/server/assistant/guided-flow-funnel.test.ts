import { describe, expect, it } from "vitest";
import { buildGuidedFlowFunnelSummary } from "./guided-flow-funnel";
import type { AssistantGuidedFlowEvent } from "@/server/db/schema";

function event(
  partial: Partial<AssistantGuidedFlowEvent> & Pick<AssistantGuidedFlowEvent, "eventKey" | "path" | "step">
): AssistantGuidedFlowEvent {
  return {
    id: partial.id ?? crypto.randomUUID(),
    workspaceId: partial.workspaceId ?? "ws-1",
    clientProfileId: partial.clientProfileId ?? "profile-1",
    threadId: partial.threadId ?? "thread-1",
    guidedFlowId: partial.guidedFlowId ?? "flow-1",
    path: partial.path,
    step: partial.step,
    eventKey: partial.eventKey,
    blockerCategory: partial.blockerCategory ?? null,
    actionRecordId: partial.actionRecordId ?? null,
    campaignId: partial.campaignId ?? null,
    metadata: partial.metadata ?? {},
    occurredAt: partial.occurredAt ?? new Date("2026-06-26T12:00:00Z"),
    createdAt: partial.createdAt ?? new Date("2026-06-26T12:00:00Z"),
  };
}

describe("buildGuidedFlowFunnelSummary", () => {
  it("aggregates path funnel and marks insufficient sample", () => {
    const events = [
      event({
        threadId: "t1",
        path: "from_zero",
        step: "collect_brief",
        eventKey: "guided_flow_started",
      }),
      event({
        threadId: "t1",
        path: "from_zero",
        step: "confirm_plan",
        eventKey: "guided_flow_completed",
      }),
      event({
        threadId: "t2",
        path: "existing_creative",
        step: "select_creative",
        eventKey: "guided_flow_started",
      }),
      event({
        threadId: "t2",
        path: "existing_creative",
        step: "select_creative",
        eventKey: "guided_action_blocked",
        blockerCategory: "missing_asset",
      }),
    ];

    const summary = buildGuidedFlowFunnelSummary(events);

    expect(summary.pathFunnel).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "from_zero",
          starts: 1,
          completions: 1,
          abandonments: 0,
        }),
        expect.objectContaining({
          path: "existing_creative",
          starts: 1,
          completions: 0,
          abandonments: 0,
          blocked: 1,
        }),
      ])
    );
    expect(summary.operationalEvidence.sampleSufficient).toBe(false);
    expect(summary.investigationLinks).toHaveLength(2);
  });

  it("computes step drop-off between consecutive steps", () => {
    const events = [
      event({
        path: "from_zero",
        step: "collect_brief",
        eventKey: "guided_step_viewed",
      }),
      event({
        path: "from_zero",
        step: "collect_brief",
        eventKey: "guided_step_viewed",
      }),
      event({
        path: "from_zero",
        step: "select_references",
        eventKey: "guided_step_viewed",
      }),
    ];

    const summary = buildGuidedFlowFunnelSummary(events);
    const briefRow = summary.stepDropoff.find(
      (row) => row.path === "from_zero" && row.step === "collect_brief"
    );

    expect(briefRow).toEqual(
      expect.objectContaining({ views: 2, dropoffs: 1 })
    );
  });
});
