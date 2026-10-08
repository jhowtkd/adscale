// The strategist's system prompt: the answer travels in `resposta`; the free plan and the talk conversation read their context
// (ticket 15), and only the free plan offers the plan (spec 2026-10-07 §3).

import { describe, expect, it } from "vitest";
import { EQUIPE_PROMPT_VERSION, strategistSystemPrompt } from "./prompts";

const MODES = ["free", "talk", "paid"] as const;

describe("strategistSystemPrompt", () => {
  it("is version v6 and says so in every conversation", () => {
    expect(EQUIPE_PROMPT_VERSION).toBe("equipe-prompts/v6");
    for (const mode of MODES) expect(strategistSystemPrompt(mode)).toContain("equipe-prompts/v6");
  });

  it("tells every conversation to put the answer in `resposta` of sugerir_proximos_passos", () => {
    for (const mode of MODES) {
      const prompt = strategistSystemPrompt(mode);
      expect(prompt).toContain("sugerir_proximos_passos");
      expect(prompt).toContain("`resposta`");
    }
  });

  it("tells the free plan its first message is the account context, that no tool reads the account, and how to offer the plan", () => {
    const prompt = strategistSystemPrompt("free");
    expect(prompt).toMatch(/first message of the conversation is the account context/);
    expect(prompt).toMatch(/no\s+tool to read the account/);
    expect(prompt).not.toContain("get_account_state");
    expect(prompt).not.toMatch(/call get_|use get_|read it with/i);
    expect(prompt).toContain("oferecer_plano");
  });

  it("tells a free brand of a paying workspace the same, without the plan and with the way to create", () => {
    const prompt = strategistSystemPrompt("talk");
    expect(prompt).toMatch(/first message of the conversation is the account context/);
    expect(prompt).toMatch(/no\s+tool to read the account/);
    expect(prompt).not.toContain("oferecer_plano");
    expect(prompt).not.toContain("Conta grátis");
    expect(prompt).toContain("Criações");
  });

  it("does not mention the account context nor the free-only rules to the paid account", () => {
    const prompt = strategistSystemPrompt("paid");
    expect(prompt).not.toMatch(/account context/i);
    expect(prompt).not.toContain("oferecer_plano");
    expect(prompt).not.toContain("Conta grátis");
    expect(strategistSystemPrompt()).toBe(prompt);
  });
});
