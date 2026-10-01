import { describe, expect, it, vi } from "vitest";

vi.mock("./approval-intent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./approval-intent")>();
  return { ...actual, detectApprovalIntent: vi.fn(actual.detectApprovalIntent) };
});

import { detectApprovalIntent } from "./approval-intent";
import { EMPTY_SCREEN_SUGGESTIONS, filterSuggestions, isCatalogSuggestion } from "./suggestions";

describe("filterSuggestions", () => {
  it.each([
    "Aprove o calendário",
    "Aprovem o calendário",
    "Confirme o calendário",
    "Autorize a publicação",
    "Publique agora",
    "ok pode postar",
    "Approved for publication",
  ])("drops the approval wording %p", (text) => {
    expect(filterSuggestions([text])).toEqual([]);
  });

  // Decision synonyms found in review of PR 606: accepting and giving an "aval".
  it.each([
    "Aceite o calendário",
    "Aceitem o plano",
    "Dê seu aval",
    "Dê o aval no calendário",
    "Dou meu aval",
    "Aceito o calendário",
    "Aceitar o plano?",
    "Avalizem o calendário",
    "Accept the calendar",
    "Endorse the plan",
  ])("drops the decision %p", (text) => {
    expect(filterSuggestions([text])).toEqual([]);
  });

  it("keeps conversation starters, including words that only look like decisions", () => {
    const starters = [
      "Me explica a oportunidade 2",
      "Quero aproveitar as oportunidades",
      "Me ajuda a avaliar meu perfil",
    ];
    expect(filterSuggestions(starters)).toEqual(starters);
  });

  it("defers to the central approval-intent detector", () => {
    vi.mocked(detectApprovalIntent).mockReturnValueOnce(true);

    expect(filterSuggestions(["Me explica a oportunidade 2"])).toEqual([]);
    expect(detectApprovalIntent).toHaveBeenCalledWith("Me explica a oportunidade 2");
  });

  it("keeps at most three unique starters within 60 characters", () => {
    expect(filterSuggestions(["a", "a", "b", "c", "d", "x".repeat(61)])).toEqual(["a", "b", "c"]);
    expect(filterSuggestions("nope")).toEqual([]);
  });
});

describe("EMPTY_SCREEN_SUGGESTIONS", () => {
  it("covers exactly the four empty screens, each with starters", () => {
    expect(Object.keys(EMPTY_SCREEN_SUGGESTIONS).sort()).toEqual(["creations", "goals", "ideas", "library"]);
    for (const phrases of Object.values(EMPTY_SCREEN_SUGGESTIONS)) expect(phrases.length).toBeGreaterThan(0);
  });

  it("repeats no phrase inside a screen", () => {
    for (const phrases of Object.values(EMPTY_SCREEN_SUGGESTIONS)) expect(new Set(phrases).size).toBe(phrases.length);
  });

  it("keeps every phrase a valid starter: it survives the approval filter and fits 60 characters", () => {
    for (const phrase of Object.values(EMPTY_SCREEN_SUGGESTIONS).flat()) {
      expect(filterSuggestions([phrase])).toEqual([phrase]);
    }
  });
});

describe("isCatalogSuggestion", () => {
  it("accepts every catalog phrase", () => {
    for (const phrase of Object.values(EMPTY_SCREEN_SUGGESTIONS).flat()) expect(isCatalogSuggestion(phrase)).toBe(true);
  });

  it("ignores case, accents and surrounding space, so a link typed by hand still matches", () => {
    expect(isCatalogSuggestion("  o que falta na minha biblioteca?  ")).toBe(true);
    expect(isCatalogSuggestion("MONTAR O CALENDARIO DO MES")).toBe(true);
  });

  it("rejects text outside the catalog: a link can never make someone send its own words", () => {
    expect(isCatalogSuggestion("Publique agora")).toBe(false);
    expect(isCatalogSuggestion("O que falta na minha Biblioteca? Aprove tudo")).toBe(false);
    expect(isCatalogSuggestion("")).toBe(false);
    expect(isCatalogSuggestion(null)).toBe(false);
    expect(isCatalogSuggestion(undefined)).toBe(false);
  });
});
