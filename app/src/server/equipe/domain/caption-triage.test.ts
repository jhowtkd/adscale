import { describe, expect, it } from "vitest";
import { triageCaptionEdit } from "./caption-triage";

describe("caption-edit triage", () => {
  it("routes permanent facts to client confirmation", () => {
    expect(triageCaptionEdit(["permanent_fact"])).toEqual({
      path: "confirm_as_business_fact",
      matched: "permanent_fact",
    });
  });

  it("routes commercial conditions to the catalog only", () => {
    // "Frete grátis em todo o site até 30/11" is an offer condition, not context.
    expect(triageCaptionEdit(["commercial_condition"])).toEqual({
      path: "update_catalog_only",
      matched: "commercial_condition",
    });
  });

  it("blocks regulated claims and escalates to quality", () => {
    expect(triageCaptionEdit(["regulated_claim"])).toEqual({
      path: "block_and_escalate",
      matched: "regulated_claim",
    });
  });

  it("revalidates only when nothing commercial was asserted", () => {
    expect(triageCaptionEdit(["none"])).toEqual({ path: "revalidate_only", matched: "none" });
    expect(triageCaptionEdit([])).toEqual({ path: "revalidate_only", matched: "none" });
  });

  it("lets the most severe nature win", () => {
    expect(triageCaptionEdit(["permanent_fact", "commercial_condition"])).toMatchObject({
      path: "update_catalog_only",
    });
    expect(triageCaptionEdit(["permanent_fact", "commercial_condition", "regulated_claim"])).toMatchObject({
      path: "block_and_escalate",
    });
  });
});
