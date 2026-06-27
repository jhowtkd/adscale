import { describe, expect, it } from "vitest";
import { classifyPlanRevisionIntent } from "./intent";

describe("classifyPlanRevisionIntent", () => {
  it("detects revise intent for plan-specific feedback", () => {
    expect(classifyPlanRevisionIntent("Ajuste o CTA do plano para Compre já")).toEqual({
      kind: "revise",
    });
  });

  it("returns clarify for vague feedback", () => {
    expect(classifyPlanRevisionIntent("melhora")).toEqual({ kind: "clarify" });
  });

  it("returns out_of_scope for briefing language", () => {
    expect(
      classifyPlanRevisionIntent("Mude o público-alvo da campanha no briefing")
    ).toEqual({ kind: "out_of_scope" });
  });

  it("continues for unrelated chat", () => {
    expect(classifyPlanRevisionIntent("obrigado")).toEqual({ kind: "continue" });
  });
});
