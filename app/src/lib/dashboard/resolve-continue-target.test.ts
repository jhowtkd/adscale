import { describe, expect, it } from "vitest";
import { resolveContinueTarget } from "./resolve-continue-target";

describe("resolveContinueTarget", () => {
  it("returns empty when there are no campaigns", () => {
    expect(resolveContinueTarget([])).toEqual({ kind: "empty" });
  });

  it("prefers a generating campaign", () => {
    const result = resolveContinueTarget([
      { id: "a", name: "Active", status: "active", updatedAt: new Date() },
      { id: "g", name: "Generating", status: "generating", updatedAt: new Date() },
    ]);
    expect(result).toMatchObject({
      kind: "campaign",
      campaignId: "g",
      href: "/campaigns/g",
    });
  });

  it("prefers active (in review) over completed", () => {
    const result = resolveContinueTarget([
      { id: "c", name: "Done", status: "completed", updatedAt: new Date() },
      { id: "a", name: "Review", status: "active", updatedAt: new Date() },
    ]);
    expect(result).toMatchObject({ kind: "campaign", campaignId: "a" });
  });

  it("falls back to the most recent campaign", () => {
    const result = resolveContinueTarget([
      { id: "latest", name: "Latest", status: "completed", updatedAt: new Date() },
    ]);
    expect(result).toMatchObject({
      kind: "campaign",
      campaignId: "latest",
      href: "/campaigns/latest",
    });
  });
});
