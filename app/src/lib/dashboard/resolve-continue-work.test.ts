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

  it("prefers generating over older resumable", () => {
    const result = resolveContinueWork([
      work({
        id: "campaign:a",
        name: "Old",
        originId: "a",
        state: "completed",
        resumable: true,
        updatedAt: "2026-07-13T15:00:00.000Z",
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
        resumeHref: "/quick-tools/create-post?workId=b",
      }),
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        kind: "work",
        name: "Hot",
        href: "/quick-tools/create-post?workId=b",
      })
    );
  });

  it("skips non-resumable", () => {
    const result = resolveContinueWork([
      work({
        id: "campaign:z",
        name: "Abandoned",
        originId: "z",
        resumable: false,
        resumeHref: "/campaigns/z",
      }),
    ]);
    expect(result).toEqual({ kind: "empty" });
  });
});
