import { describe, expect, it } from "vitest";
import { classifyCreativeRevisionIntent } from "./intent";

describe("classifyCreativeRevisionIntent", () => {
  it("detects creative intent for visual feedback about color", () => {
    expect(classifyCreativeRevisionIntent("muda a cor de fundo")).toEqual({
      kind: "creative",
    });
  });

  it("detects plan intent when CTA of plan is mentioned", () => {
    expect(classifyCreativeRevisionIntent("ajusta o CTA do plano")).toEqual({
      kind: "plan",
    });
  });

  it("returns ambiguous for vague revise feedback without visual/plan keywords", () => {
    expect(classifyCreativeRevisionIntent("melhora isso")).toEqual({
      kind: "ambiguous",
    });
  });

  it("returns continue for unrelated chat", () => {
    expect(classifyCreativeRevisionIntent("obrigado")).toEqual({
      kind: "continue",
    });
  });

  it("detects creative intent for visual feedback about image", () => {
    expect(classifyCreativeRevisionIntent("troca a imagem de fundo")).toEqual({
      kind: "creative",
    });
  });

  it("detects plan intent when strategy is mentioned", () => {
    expect(classifyCreativeRevisionIntent("altera a estratégia")).toEqual({
      kind: "plan",
    });
  });

  it("returns continue for empty message", () => {
    expect(classifyCreativeRevisionIntent("")).toEqual({
      kind: "continue",
    });
  });
});
