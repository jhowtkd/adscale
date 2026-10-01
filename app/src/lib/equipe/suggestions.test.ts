import { describe, expect, it, vi } from "vitest";

vi.mock("./approval-intent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./approval-intent")>();
  return { ...actual, detectApprovalIntent: vi.fn(actual.detectApprovalIntent) };
});

import { detectApprovalIntent } from "./approval-intent";
import { filterSuggestions } from "./suggestions";

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
