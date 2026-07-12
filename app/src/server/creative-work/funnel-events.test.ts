import { describe, expect, it } from "vitest";
import {
  classifyLegacyEvent,
  CREATIVE_WORK_FUNNEL_EVENTS,
  CREATIVE_WORK_FUNNEL_STAGES,
  CREATIVE_WORK_ORIGINS,
  isCreativeWorkFunnelEvent,
  isCreativeWorkOrigin,
  mapLegacyEvent,
  STAGE_AFTER_EVENT,
} from "./funnel-events";

describe("creative-work funnel events", () => {
  it("declares the canonical funnel sequence in order", () => {
    expect(CREATIVE_WORK_FUNNEL_EVENTS.slice(0, 7)).toEqual([
      "creative_work_started",
      "briefing_ready",
      "generation_confirmed",
      "output_ready",
      "creative_work_reviewed",
      "creative_work_approved",
      "creative_work_delivered",
    ]);
  });

  it("includes abandoned, failed and reopened as terminal/non-terminal side events", () => {
    expect(CREATIVE_WORK_FUNNEL_EVENTS).toContain("creative_work_abandoned");
    expect(CREATIVE_WORK_FUNNEL_EVENTS).toContain("creative_work_failed");
    expect(CREATIVE_WORK_FUNNEL_EVENTS).toContain("creative_work_reopened");
  });

  it("maps every funnel event to a known stage", () => {
    for (const event of CREATIVE_WORK_FUNNEL_EVENTS) {
      const stage = STAGE_AFTER_EVENT[event];
      expect(CREATIVE_WORK_FUNNEL_STAGES).toContain(stage);
    }
  });

  it("keeps the approved and delivered stages distinct", () => {
    expect(STAGE_AFTER_EVENT.creative_work_approved).toBe("approved");
    expect(STAGE_AFTER_EVENT.creative_work_delivered).toBe("delivered");
    expect(STAGE_AFTER_EVENT.creative_work_approved).not.toBe(
      STAGE_AFTER_EVENT.creative_work_delivered
    );
  });

  it("classifies the three competing origins without changing business rules", () => {
    expect(CREATIVE_WORK_ORIGINS).toEqual([
      "campaign",
      "assistant",
      "quick_tool",
    ]);
    expect(isCreativeWorkOrigin("campaign")).toBe(true);
    expect(isCreativeWorkOrigin("newsletter")).toBe(false);
  });

  it("type-guards canonical event strings", () => {
    expect(isCreativeWorkFunnelEvent("output_ready")).toBe(true);
    expect(isCreativeWorkFunnelEvent("user_clicked_button")).toBe(false);
    expect(isCreativeWorkFunnelEvent(null)).toBe(false);
  });

  it("maps legacy telemetry vocabulary onto the canonical funnel", () => {
    expect(mapLegacyEvent({ eventKey: "guided_flow_started" })).toBe(
      "creative_work_started"
    );
    // UI-only events have no canonical equivalent.
    expect(mapLegacyEvent({ eventKey: "cockpit_stage_entered" })).toBeNull();
    // Unknown event keys map to null rather than a wrong canonical event.
    expect(mapLegacyEvent({ eventKey: "some_random_event" })).toBeNull();
  });

  it("does NOT classify mission_completed as delivered for non-creative missions", () => {
    // QA / review / export / share completions share the event name; without
    // the right missionKey they must NOT inflate creative delivery counts.
    expect(
      mapLegacyEvent({
        eventKey: "mission_completed",
        metadata: { missionKey: "creative_qa" },
      })
    ).toBeNull();
    expect(
      classifyLegacyEvent({
        eventKey: "mission_completed",
        metadata: { missionKey: "share" },
      }).kind
    ).toBe("unmapped_inapplicable");
  });

  it("classifies mission_completed as delivered only for creative-delivery missions", () => {
    expect(
      mapLegacyEvent({
        eventKey: "mission_completed",
        metadata: { missionKey: "creative_delivery" },
      })
    ).toBe("creative_work_delivered");
    expect(
      mapLegacyEvent({
        eventKey: "mission_completed",
        metadata: { missionKey: "delivery_package" },
      })
    ).toBe("creative_work_delivered");
  });

  it("distinguishes unmapped-unknown from unmapped-inapplicable", () => {
    expect(
      classifyLegacyEvent({ eventKey: "never_seen_before" }).kind
    ).toBe("unmapped_unknown");
    expect(
      classifyLegacyEvent({
        eventKey: "mission_completed",
        metadata: { missionKey: "export" },
      }).kind
    ).toBe("unmapped_inapplicable");
    expect(
      classifyLegacyEvent({ eventKey: "guided_flow_started" }).kind
    ).toBe("mapped");
  });

  it("restricts guided_flow_completed to assistant origin", () => {
    expect(
      mapLegacyEvent({
        eventKey: "guided_flow_completed",
        origin: "assistant",
      })
    ).toBe("creative_work_approved");
    expect(
      mapLegacyEvent({ eventKey: "guided_flow_completed", origin: "campaign" })
    ).toBeNull();
  });

  it("maps cockpit_stage_completed to output_ready ONLY for preview stage", () => {
    // Only "preview" stage means an output exists. Briefing / strategy /
    // guided_briefing completions must NOT inflate output_ready.
    expect(
      mapLegacyEvent({
        eventKey: "cockpit_stage_completed",
        metadata: { stage: "preview" },
      })
    ).toBe("output_ready");
    expect(
      mapLegacyEvent({
        eventKey: "cockpit_stage_completed",
        metadata: { stage: "briefing" },
      })
    ).toBeNull();
    expect(
      mapLegacyEvent({
        eventKey: "cockpit_stage_completed",
        metadata: { stage: "guided_briefing" },
      })
    ).toBeNull();
    expect(
      mapLegacyEvent({
        eventKey: "cockpit_stage_completed",
        metadata: { stage: "strategy_recipe" },
      })
    ).toBeNull();
    // missionKey fallback when stage is absent
    expect(
      mapLegacyEvent({
        eventKey: "cockpit_stage_completed",
        metadata: { missionKey: "preview" },
      })
    ).toBe("output_ready");
    expect(
      classifyLegacyEvent({
        eventKey: "cockpit_stage_completed",
        metadata: { stage: "briefing" },
      }).kind
    ).toBe("unmapped_inapplicable");
  });
});
