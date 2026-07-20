import { describe, expect, it } from "vitest";
import { resolveContinueWork } from "./resolve-continue-work";
import type { CanonicalWorkSummary } from "@/server/creative-work/canonical/types";

function work(
  partial: Partial<CanonicalWorkSummary> & Pick<CanonicalWorkSummary, "id" | "name">
): CanonicalWorkSummary {
  return {
    originKind: "campaign",
    originId: "x",
    origin: "campaign",
    workspaceId: "ws",
    clientProfileId: "client-1",
    state: "briefing",
    updatedAt: "2026-07-13T12:00:00.000Z",
    resumable: true,
    resumeHref: `/campaigns/${partial.originId ?? "x"}`,
    ...partial,
  };
}

describe("resolveContinueWork", () => {
  it("returns empty when no works", () => {
    expect(resolveContinueWork([])).toEqual({ kind: "empty" });
  });

  it("prefers generating over older intending", () => {
    const result = resolveContinueWork([
      work({
        id: "campaign:a",
        name: "Old intending",
        originId: "a",
        state: "intending",
        resumable: true,
        updatedAt: "2026-07-13T09:00:00.000Z",
        resumeHref: "/campaigns/a",
      }),
      work({
        id: "creative_work:b",
        name: "Hot",
        originKind: "creative_work",
        originId: "b",
        origin: "quick_tool",
        state: "generating",
        resumable: true,
        updatedAt: "2026-07-13T10:00:00.000Z",
        resumeHref: "/?workId=b",
      }),
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        kind: "work",
        name: "Hot",
        href: "/?workId=b",
        originId: "b",
      })
    );
  });

  it("does not treat approved/delivered as continue targets", () => {
    const result = resolveContinueWork([
      work({
        id: "campaign:done",
        name: "Done",
        originId: "done",
        state: "approved",
        resumable: true,
        updatedAt: "2026-07-13T15:00:00.000Z",
        resumeHref: "/campaigns/done",
      }),
      work({
        id: "campaign:shipped",
        name: "Shipped",
        originId: "shipped",
        state: "delivered",
        resumable: true,
        updatedAt: "2026-07-13T16:00:00.000Z",
        resumeHref: "/campaigns/shipped",
      }),
    ]);
    expect(result).toEqual({ kind: "empty" });
  });

  it("includes intending as in-progress", () => {
    const result = resolveContinueWork([
      work({
        id: "campaign:draft",
        name: "Draft",
        originId: "draft",
        state: "intending",
        resumable: true,
        resumeHref: "/campaigns/draft",
      }),
    ]);
    expect(result).toEqual(
      expect.objectContaining({ kind: "work", name: "Draft" })
    );
  });

  it("skips non-resumable", () => {
    const result = resolveContinueWork([
      work({
        id: "campaign:z",
        name: "Abandoned",
        originId: "z",
        state: "generating",
        resumable: false,
        resumeHref: "/campaigns/z",
      }),
    ]);
    expect(result).toEqual({ kind: "empty" });
  });
});
