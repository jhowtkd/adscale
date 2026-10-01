// The words of the credit-ended case (ticket 13, D-12), in both languages: the four keys exist, are not empty, tell the truth (no "ready diagnosis" in a
// card that says there is none), never say "Equipe" or a price, and are different from the ordinary lines they replace.
import { describe, expect, it } from "vitest";
import ptBR from "../../../messages/pt-BR.json";
import en from "../../../messages/en.json";

const NO_PRICE_PATTERN = /r\$|\$\s?\d|pre[çc]o|price|valor mensal|mensalidade|por m[êe]s|\/\s?m[êe]s|\/\s?mo\b/i;
const messages = { "pt-BR": ptBR, en } as const;
const KEYS = [["diagnosis", "budgetIntro"], ["diagnosis", "talkToPerson"], ["diagnosis", "talkToPersonHint"], ["plan", "introBudget"]] as const;
const read = (locale: "pt-BR" | "en", group: "diagnosis" | "plan", key: string) => (messages[locale].assistant.equipe[group] as Record<string, string>)[key];

describe.each(["pt-BR", "en"] as const)("%s", (locale) => {
  it.each(KEYS)("%s.%s exists, is text, and is not blank", (group, key) => {
    const value = read(locale, group, key);
    expect(typeof value).toBe("string");
    expect(value!.trim().length).toBeGreaterThan(8);
    expect(value).not.toMatch(/\{|\}|undefined|null/);
  });

  it("none of the four says 'Equipe' or a price", () => {
    for (const [group, key] of KEYS) {
      expect(read(locale, group, key), `${group}.${key}`).not.toMatch(/\bEquipe\b/);
      expect(read(locale, group, key), `${group}.${key}`).not.toMatch(NO_PRICE_PATTERN);
    }
  });

  it("the credit lines say there is no diagnosis; the ordinary lines they replace are different", () => {
    const d = messages[locale].assistant.equipe.diagnosis, p = messages[locale].assistant.equipe.plan;
    expect(d.budgetIntro).not.toBe(d.failedIntro);
    expect(p.introBudget).not.toBe(p.intro);
    expect(d.talkToPerson).not.toBe(d.talkToPersonHint);
    // The card cannot claim a diagnosis that was not built: it says it was not (or could not be) built.
    expect(d.budgetIntro).toMatch(locale === "en" ? /could not build|not (?:ready|built)/i : /não consegui montar|não (?:ficou|foi)/i);
    expect(p.introBudget).toMatch(locale === "en" ? /before the diagnosis was ready/i : /antes de o diagnóstico ficar pronto/i);
    // The Library stays the person's, in the plan card.
    expect(p.introBudget).toMatch(locale === "en" ? /Library/ : /Biblioteca/);
  });
});

describe("the two languages say the same things", () => {
  it("each key has a counterpart of a similar size (no one-word stub next to a sentence)", () => {
    for (const [group, key] of KEYS) {
      const a = read("pt-BR", group, key)!, b = read("en", group, key)!;
      expect(a).not.toBe(b);
      expect(Math.min(a.length, b.length) / Math.max(a.length, b.length), `${group}.${key}`).toBeGreaterThan(0.45);
    }
  });
  it("the keys are the same in both languages for the whole diagnosis and plan groups", () => {
    expect(Object.keys(en.assistant.equipe.diagnosis).sort()).toEqual(Object.keys(ptBR.assistant.equipe.diagnosis).sort());
    expect(Object.keys(en.assistant.equipe.plan).sort()).toEqual(Object.keys(ptBR.assistant.equipe.plan).sort());
  });
});
