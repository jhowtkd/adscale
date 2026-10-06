// The texts the free plan's refusal shows (ticket 11, part 2) exist in both languages, and the keys the components read
// through next-intl resolve to real, non-empty strings.
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import ptBR from "../../../messages/pt-BR.json";

const locales = { "pt-BR": ptBR, en } as const;

function lookup(messages: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), messages);
}

const KEYS = [
  "errors.free_plan",
  "billing.conversion.reasons.free_plan",
  "billing.conversion.actions.plan_request",
  "billing.conversion.freePlan.action",
  "billing.conversion.freePlan.campaignAssistant",
  "billing.conversion.freePlan.billingIntro",
  "billing.conversion.freePlan.openConversation",
  "billing.conversion.freePlan.noAccount",
  "dashboard.home.composer.results.reviewFreePlan",
  // What FreePlanCta reads from the plan card's namespace.
  "assistant.equipe.plan.sending",
  "assistant.equipe.plan.requested",
  "assistant.equipe.plan.confirmation",
  "assistant.equipe.plan.contact",
  "assistant.equipe.plan.error",
];

describe.each(Object.entries(locales))("free plan texts in %s", (_locale, messages) => {
  it.each(KEYS)("%s is a non-empty string", (key) => {
    const value = lookup(messages, key);
    expect(typeof value, key).toBe("string");
    expect((value as string).trim().length, key).toBeGreaterThan(0);
  });

  it("never offers a checkout wording for the plan request", () => {
    const text = [
      lookup(messages, "billing.conversion.actions.plan_request"),
      lookup(messages, "billing.conversion.freePlan.action"),
    ].join(" ");
    expect(text).not.toMatch(/subscribe|assinar|checkout|pagamento|payment/i);
  });
});

describe("the two languages agree", () => {
  it.each(KEYS)("%s differs between pt-BR and en (translated, not copied)", (key) => {
    expect(lookup(ptBR, key)).not.toBe(lookup(en, key));
  });

  it("the plan request label is the same in the conversion action and in the CTA", () => {
    for (const messages of [ptBR, en]) {
      expect(lookup(messages, "billing.conversion.actions.plan_request")).toBe(lookup(messages, "billing.conversion.freePlan.action"));
    }
    expect(lookup(ptBR, "billing.conversion.freePlan.action")).toBe("Falar com uma pessoa");
  });
});
