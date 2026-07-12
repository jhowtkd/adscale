import { describe, expect, it } from "vitest";
import {
  CREATIVE_WORK_FUNNEL_EVENTS,
  CREATIVE_WORK_FUNNEL_STAGES,
  CREATIVE_WORK_ORIGINS,
  isCreativeWorkFunnelEvent,
  isCreativeWorkOrigin,
  LEGACY_TO_CANONICAL_EVENT,
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
    expect(LEGACY_TO_CANONICAL_EVENT.guided_flow_started).toBe(
      "creative_work_started"
    );
    expect(LEGACY_TO_CANONICAL_EVENT.mission_completed).toBe(
      "creative_work_delivered"
    );
    // UI-only events have no canonical equivalent.
    expect(LEGACY_TO_CANONICAL_EVENT.cockpit_stage_entered).toBeNull();
  });
});
