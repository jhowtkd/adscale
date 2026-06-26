import { describe, it, expect } from "vitest";
import {
  classifyGuidedPath,
  classifyUserIntent,
  buildIntentPromptAugment,
} from "./intent-classifier";

describe("classifyUserIntent", () => {
  it("skips generic greetings under 40 characters", () => {
    expect(classifyUserIntent("Olá")).toEqual({ kind: "skip" });
    expect(classifyUserIntent("oi")).toEqual({ kind: "skip" });
    expect(classifyUserIntent("Bom dia")).toEqual({ kind: "skip" });
  });

  it("classifies quick action keywords as quick_action", () => {
    expect(classifyUserIntent("quero reestilizar esse criativo")).toEqual({
      kind: "classified",
      intent: "quick_action",
      source: "heuristic",
    });
  });

  it("classifies campaign keywords as complete_campaign", () => {
    expect(
      classifyUserIntent("montar campanha completa para lançamento")
    ).toEqual({
      kind: "classified",
      intent: "complete_campaign",
      source: "heuristic",
    });
  });

  it("returns Portuguese clarification when both families match", () => {
    expect(
      classifyUserIntent(
        "quero reestilizar e montar campanha completa para o lançamento"
      )
    ).toEqual({
      kind: "clarify",
      question: "Você quer uma ação pontual ou montar uma campanha completa?",
    });
  });

  it("skips messages with no action signal", () => {
    expect(classifyUserIntent("como funciona o assistente?")).toEqual({
      kind: "skip",
    });
  });
});

describe("classifyGuidedPath", () => {
  it("classifies existing creative keywords", () => {
    expect(classifyGuidedPath("já tenho uma peça pronta para adaptar")).toEqual({
      kind: "classified",
      path: "existing_creative",
      source: "heuristic",
    });
  });

  it("classifies from-zero keywords", () => {
    expect(classifyGuidedPath("quero produzir do zero com referências visuais")).toEqual({
      kind: "classified",
      path: "from_zero",
      source: "heuristic",
    });
  });

  it("asks clarifying question when both paths match", () => {
    expect(
      classifyGuidedPath("já tenho peça mas quero produzir do zero")
    ).toEqual({
      kind: "clarify",
      question: "Você já tem uma peça criativa ou quer produzir do zero?",
    });
  });
});

describe("buildIntentPromptAugment", () => {
  it("augments classified quick_action intent", () => {
    const result = buildIntentPromptAugment({
      kind: "classified",
      intent: "quick_action",
      source: "heuristic",
    });
    expect(result).toContain("Intent family: quick_action");
    expect(result).toContain("prefer contracts in that family");
  });

  it("augments classified complete_campaign intent", () => {
    const result = buildIntentPromptAugment({
      kind: "classified",
      intent: "complete_campaign",
      source: "heuristic",
    });
    expect(result).toContain("Intent family: complete_campaign");
  });

  it("returns fallback hint for skip", () => {
    const result = buildIntentPromptAugment({ kind: "skip" });
    expect(result).toContain("quick action vs. complete campaign");
  });

  it("returns null for clarify", () => {
    expect(
      buildIntentPromptAugment({
        kind: "clarify",
        question: "Você quer uma ação pontual ou montar uma campanha completa?",
      })
    ).toBeNull();
  });
});
