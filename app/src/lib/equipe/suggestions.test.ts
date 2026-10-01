import { describe, expect, it } from "vitest";
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
  ])("drops the approval word list entry %p", (text) => {
    expect(filterSuggestions([text])).toEqual([]);
  });

  // Not in the word list: the central approval-intent detector is what drops them,
  // so a phrase the server would read as an approval is never offered as a click.
  it.each([
    "Aceite o calendário",
    "Aceitem o plano",
    "Dê seu aval",
    "Dê o aval no calendário",
    "Dou meu aval",
    "Aceito o calendário",
  ])("drops the decision %p through the central detector", (text) => {
    expect(filterSuggestions([text])).toEqual([]);
  });

  it("keeps conversation starters, including words that only look like decisions", () => {
    const starters = [
      "Me explica a oportunidade 2",
      "Quero aproveitar as oportunidades",
      "Me ajuda a avaliar meu perfil",
      "Como funciona o aceite dos termos?",
    ];
    expect(filterSuggestions(starters)).toEqual(starters.slice(0, 3));
    expect(filterSuggestions([starters[3]])).toEqual([starters[3]]);
  });

  it("keeps at most three unique starters within 60 characters", () => {
    expect(filterSuggestions(["a", "a", "b", "c", "d", "x".repeat(61)])).toEqual(["a", "b", "c"]);
    expect(filterSuggestions("nope")).toEqual([]);
  });
});
