// The Strategist's opening line (ticket 13). The owner approved the range measured in the real test: "Leva de 3 a 5 minutos." (139 to 200 s of machine
// time, plus the person confirming four cards). The line is kept once, in pt-BR (the conversation store), and shown in the reader's language (messages).
import { describe, expect, it } from "vitest";
import { HANDOFF_COPY, handoffText } from "./handoff-copy";
import ptBR from "../../../messages/pt-BR.json";
import en from "../../../messages/en.json";

describe("the opening line", () => {
  it("ends on the measured range, in pt-BR and in English, and says it once", () => {
    expect(HANDOFF_COPY["pt-BR"].intro.endsWith(" Leva de 3 a 5 minutos.")).toBe(true);
    expect(HANDOFF_COPY.en.intro.endsWith(" It takes 3 to 5 minutes.")).toBe(true);
    expect(HANDOFF_COPY["pt-BR"].intro.match(/minutos/g)).toHaveLength(1);
    expect(HANDOFF_COPY.en.intro.match(/minutes/g)).toHaveLength(1);
  });

  it("still opens as it did: who speaks, and that nothing is created before the brand is known", () => {
    expect(HANDOFF_COPY["pt-BR"].intro).toMatch(/^Oi! Sou o Estrategista do ADScale\. Antes de criar qualquer coisa, vou conhecer a sua marca\. /);
    expect(HANDOFF_COPY.en.intro).toMatch(/^Hi! I am the ADScale Strategist\. Before creating anything, I will get to know your brand\. /);
  });

  it.each([["pt-BR", ptBR], ["en", en]] as const)("%s: the line the store keeps is the line the screen shows", (locale, messages) => {
    expect(handoffText("intro", locale)).toBe(messages.assistant.handoff.introText);
  });

  it("an English locale with a region reads the English line; anything else reads pt-BR", () => {
    expect(handoffText("intro", "en-US")).toBe(HANDOFF_COPY.en.intro);
    expect(handoffText("intro", "pt-BR")).toBe(HANDOFF_COPY["pt-BR"].intro);
    expect(handoffText("intro")).toBe(HANDOFF_COPY["pt-BR"].intro);
  });

  it("promises a range, never a speed: no seconds, no 'quick'", () => {
    for (const line of [HANDOFF_COPY["pt-BR"].intro, HANDOFF_COPY.en.intro]) {
      expect(line).not.toMatch(/segundos?|seconds?|r[áa]pid|quick|fast|instant/i);
    }
  });
});
