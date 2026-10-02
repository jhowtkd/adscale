// The strategist's system prompt (ticket 15): the answer travels in `resposta`, and only the free account reads its context.

import { describe, expect, it } from "vitest";
import { EQUIPE_PROMPT_VERSION, strategistSystemPrompt } from "./prompts";

describe("strategistSystemPrompt", () => {
  it("is version v4 and says so in the prompt", () => {
    expect(EQUIPE_PROMPT_VERSION).toBe("equipe-prompts/v4");
    for (const free of [false, true]) expect(strategistSystemPrompt(free)).toContain("equipe-prompts/v4");
  });

  it("tells both accounts to put the answer in `resposta` of sugerir_proximos_passos", () => {
    for (const free of [false, true]) {
      const prompt = strategistSystemPrompt(free);
      expect(prompt).toContain("sugerir_proximos_passos");
      expect(prompt).toContain("`resposta`");
    }
  });

  it("tells the free account its first message is the account context and that no tool reads the account", () => {
    const prompt = strategistSystemPrompt(true);
    expect(prompt).toMatch(/first message of the conversation is the account context/);
    expect(prompt).toMatch(/no\s+tool to read the account/);
    expect(prompt).not.toContain("get_account_state");
    expect(prompt).not.toMatch(/call get_|use get_|read it with/i);
    expect(prompt).toContain("oferecer_plano");
  });

  it("does not mention the account context nor the free-only rules to the paid account", () => {
    const prompt = strategistSystemPrompt(false);
    expect(prompt).not.toMatch(/account context/i);
    expect(prompt).not.toContain("oferecer_plano");
    expect(prompt).not.toContain("Conta grátis");
    expect(strategistSystemPrompt()).toBe(prompt);
  });
});
