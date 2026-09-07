import { describe, expect, it } from "vitest";
import type { BetaAnalyticsEvent } from "@/server/db/schema";
import {
  aggregateValueDelivered,
  pieceVersionIdentity,
  utcWeekStart,
} from "./value-delivered";
import { canonicalCreativeWorkOrigin } from "./funnel-events";

const workspaceId = "ws-1";

function event(
  overrides: Partial<BetaAnalyticsEvent> & Pick<BetaAnalyticsEvent, "eventKey">,
): BetaAnalyticsEvent {
  return {
    id: crypto.randomUUID(),
    workspaceId,
    userId: "user-1",
    sessionId: null,
    properties: {},
    source: "server",
    campaignId: null,
    derivationId: null,
    createdAt: new Date("2026-09-02T12:00:00.000Z"),
    ...overrides,
  };
}

describe("value delivered aggregation", () => {
  it("maps historical quick_tool origin to studio", () => {
    expect(canonicalCreativeWorkOrigin("quick_tool")).toBe("studio");
    expect(canonicalCreativeWorkOrigin("studio")).toBe("studio");
    expect(canonicalCreativeWorkOrigin("campaign")).toBe("campaign");
  });

  it("uses Monday UTC as the week bucket", () => {
    expect(utcWeekStart(new Date("2026-09-06T18:00:00.000Z"))).toBe("2026-08-31");
  });

  it("does not inflate selected count on reload or retry of the same version", () => {
    const properties = {
      creativeWorkId: "work-1",
      outputId: "output-1",
      outputKey: "creative-work/output-1/v1.png",
      protocol: "single",
      origin: "studio",
    };
    const summary = aggregateValueDelivered([
      event({ eventKey: "creative_work_approved", id: "a1", properties, source: "client" }),
      event({ eventKey: "creative_work_approved", id: "a2", properties, source: "server" }),
    ]);
    expect(summary.selectedPieces).toBe(1);
    expect(summary.deliveredPieces).toBe(0);
  });

  it("collapses client work-level events when the same work has an output version", () => {
    const summary = aggregateValueDelivered([
      event({
        eventKey: "creative_work_approved",
        id: "client-reload",
        source: "client",
        properties: { creativeWorkId: "work-1", protocol: "single" },
      }),
      event({
        eventKey: "creative_work_approved",
        id: "server-select",
        properties: {
          creativeWorkId: "work-1",
          outputId: "output-1",
          outputKey: "creative-work/output-1/v1.png",
          protocol: "single",
          origin: "studio",
        },
      }),
    ]);
    expect(summary.selectedPieces).toBe(1);
  });

  it("does not inflate delivery when the same version is exported twice", () => {
    const properties = {
      creativeWorkId: "work-1",
      outputId: "output-1",
      outputKey: "creative-work/output-1/v1.png",
      protocol: "single",
      origin: "studio",
    };
    const summary = aggregateValueDelivered([
      event({ eventKey: "creative_work_delivered", id: "d1", properties }),
      event({ eventKey: "creative_work_delivered", id: "d2", properties }),
    ]);
    expect(summary.deliveredPieces).toBe(1);
  });

  it("counts a new outputKey as a distinct delivered piece", () => {
    const summary = aggregateValueDelivered([
      event({
        eventKey: "creative_work_delivered",
        id: "d1",
        properties: {
          creativeWorkId: "work-1",
          outputId: "output-1",
          outputKey: "creative-work/output-1/v1.png",
          protocol: "single",
          origin: "studio",
        },
      }),
      event({
        eventKey: "creative_work_delivered",
        id: "d2",
        properties: {
          creativeWorkId: "work-1",
          outputId: "output-1",
          outputKey: "creative-work/output-1/v2.png",
          protocol: "single",
          origin: "studio",
        },
      }),
    ]);
    expect(summary.deliveredPieces).toBe(2);
  });

  it("segments by origin and protocol, treating quick_tool as studio", () => {
    const summary = aggregateValueDelivered([
      event({
        eventKey: "creative_work_approved",
        id: "studio",
        properties: {
          creativeWorkId: "work-1",
          outputId: "output-1",
          outputKey: "k1",
          protocol: "single",
          origin: "quick_tool",
        },
      }),
      event({
        eventKey: "creative_work_approved",
        id: "campaign",
        workspaceId: "ws-1",
        properties: {
          creativeWorkId: "work-2",
          outputId: "output-2",
          outputKey: "k2",
          protocol: "carousel",
          origin: "campaign",
        },
      }),
    ]);
    expect(summary.byOrigin).toEqual([
      { origin: "campaign", selectedPieces: 1, deliveredPieces: 0 },
      { origin: "studio", selectedPieces: 1, deliveredPieces: 0 },
    ]);
    expect(summary.byProtocol).toEqual([
      { protocol: "carousel", selectedPieces: 1, deliveredPieces: 0 },
      { protocol: "single", selectedPieces: 1, deliveredPieces: 0 },
    ]);
  });

  it("reconciles selected event versions against database pieces", () => {
    const summary = aggregateValueDelivered(
      [
        event({
          eventKey: "creative_work_approved",
          properties: {
            creativeWorkId: "work-1",
            outputId: "output-1",
            outputKey: "k1",
            protocol: "single",
            origin: "studio",
          },
        }),
      ],
      [
        { workspaceId, outputId: "output-1", outputKey: "k1" },
        { workspaceId, outputId: "output-2", outputKey: "k2" },
      ],
    );
    expect(summary.reconcile).toEqual({
      selectedFromDatabase: 2,
      selectedFromEvents: 1,
      missingFromEvents: 1,
      orphanedFromEvents: 0,
    });
  });

  it("identifies a piece version from outputId and outputKey", () => {
    expect(pieceVersionIdentity({ outputId: "o1", outputKey: "k1" })).toBe("out:o1:k1");
    expect(pieceVersionIdentity({ creativeWorkId: "w1" })).toBe("work:w1");
  });
});
