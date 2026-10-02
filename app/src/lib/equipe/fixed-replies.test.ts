// The fixed lines of the exhausted conversation (ticket 13: D-12 and the screen review, T7 and T8): stored once in pt-BR with a key, shown in the reader's language.
import { describe, expect, it } from "vitest";
import { FIXED_REPLIES, fixedReplyOf, fixedReplyText, isPlanLaterPhrase, planLaterMessage, type FixedReply } from "./fixed-replies";

const KEYS = ["free_budget_exhausted", "diagnosis_budget_exceeded", "plan_later"] as const satisfies readonly FixedReply[];

describe("FIXED_REPLIES", () => {
  it("has the same lines in both languages", () => {
    expect(Object.keys(FIXED_REPLIES["pt-BR"]).sort()).toEqual([...KEYS].sort());
    expect(Object.keys(FIXED_REPLIES.en).sort()).toEqual([...KEYS].sort());
  });

  it.each(KEYS)("%s: every language tells the person what to say, in quotes, once", (key) => {
    for (const locale of ["pt-BR", "en"] as const) {
      expect(FIXED_REPLIES[locale][key].match(/“[^”]+”/g)).toHaveLength(1);
    }
    expect(FIXED_REPLIES["pt-BR"][key]).toContain("“quero assinar”");
    expect(FIXED_REPLIES.en[key]).toContain("“I want to subscribe”");
  });

  it.each(KEYS)("%s: a line is a sentence for the screen, never a price or a promise about the plan", (key) => {
    for (const locale of ["pt-BR", "en"] as const) {
      expect(FIXED_REPLIES[locale][key]).not.toMatch(/R\$|\$\s?\d|pre[çc]o|price|valor|mensal|monthly|per month|desconto|discount/i);
    }
  });

  it("only the first one says that the diagnosis is available: the other two cannot claim what is false for the person they are for", () => {
    expect(FIXED_REPLIES["pt-BR"].free_budget_exhausted).toContain("O diagnóstico e a Biblioteca continuam disponíveis");
    expect(FIXED_REPLIES.en.free_budget_exhausted).toContain("Your diagnosis and Library are still available");
    for (const key of ["diagnosis_budget_exceeded", "plan_later"] as const) {
      expect(FIXED_REPLIES["pt-BR"][key]).not.toMatch(/O diagnóstico e a Biblioteca/);
      expect(FIXED_REPLIES.en[key]).not.toMatch(/Your diagnosis and Library/);
    }
    // The one for the person with no diagnosis says so, in both languages.
    expect(FIXED_REPLIES["pt-BR"].diagnosis_budget_exceeded).toContain("não consegui montar o diagnóstico");
    expect(FIXED_REPLIES.en.diagnosis_budget_exceeded).toContain("could not build the diagnosis");
  });

  it("'Agora não' is answered by a line that does not invite the person to carry on for free", () => {
    expect(FIXED_REPLIES["pt-BR"].plan_later).not.toMatch(/gr[aá]tis|gratuit/i);
    expect(FIXED_REPLIES.en.plan_later).not.toMatch(/\bfree\b/i);
  });
});

describe("fixedReplyText", () => {
  it.each([
    ["pt-BR", "pt-BR"], ["pt", "pt-BR"], ["pt-PT", "pt-BR"], ["es", "pt-BR"], ["", "pt-BR"], ["en", "en"], ["en-US", "en"], ["en-GB", "en"],
  ] as const)("language %p reads the %s line", (language, line) => {
    for (const key of KEYS) expect(fixedReplyText(key, language)).toBe(FIXED_REPLIES[line][key]);
  });

  it("reads pt-BR when no language is given", () => {
    for (const key of KEYS) expect(fixedReplyText(key)).toBe(FIXED_REPLIES["pt-BR"][key]);
  });
});

describe("fixedReplyOf", () => {
  it.each(KEYS)("knows a stored message carrying %s", (key) => {
    expect(fixedReplyOf({ fixedReply: key })).toBe(key);
    expect(fixedReplyOf({ fixedReply: key, suggestions: ["x"], other: 1 })).toBe(key);
  });

  it.each([
    ["no payload", null], ["undefined", undefined], ["a string", "plan_later"], ["a number", 3], ["an array", ["plan_later"]], ["an empty payload", {}],
    ["an unknown key", { fixedReply: "inventada" }], ["a key that is not a string", { fixedReply: 3 }], ["a null key", { fixedReply: null }],
    ["an inherited property name", { fixedReply: "constructor" }], ["__proto__", { fixedReply: "__proto__" }], ["toString", { fixedReply: "toString" }],
    ["another payload field", { handoffStep: "intro" }], ["the wrong case", { fixedReply: "PLAN_LATER" }],
  ])("is null for %s", (_label, payload) => {
    expect(fixedReplyOf(payload)).toBeNull();
  });
});

describe("planLaterMessage and isPlanLaterPhrase", () => {
  it.each([["pt-BR", "Agora não"], ["pt", "Agora não"], ["en", "Not now"], ["en-US", "Not now"]] as const)("%s sends %p", (language, phrase) => {
    expect(planLaterMessage(language)).toBe(phrase);
  });

  it("sends the pt-BR phrase when no language is given", () => {
    expect(planLaterMessage()).toBe("Agora não");
  });

  it.each(["pt-BR", "en"])("what the button sends in %s is recognized by the server", (language) => {
    expect(isPlanLaterPhrase(planLaterMessage(language))).toBe(true);
  });

  it.each([
    "Agora não", "agora não", "agora nao", "  AGORA NÃO!  ", "Agora não.", "Agora não...", "agora não?!",
    "Not now", "not now", "NOT NOW!", "  not now.  ",
  ])("recognizes %p, in any spelling and in either language", (text) => {
    expect(isPlanLaterPhrase(text)).toBe(true);
  });

  it.each([
    "", " ", "agora", "não", "agora não quero", "agora não, quero assinar", "Agora não. Quero assinar", "not now, I want to subscribe", "now", "not",
    "Continuar no grátis por enquanto", "talvez depois", "later", "quero assinar", "I want to subscribe",
  ])("does not recognize %p: it is not the whole message of that button", (text) => {
    expect(isPlanLaterPhrase(text)).toBe(false);
  });
});
