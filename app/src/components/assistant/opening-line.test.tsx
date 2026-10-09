// The Strategist's opening line, from the account that opens to the screen (ticket 13, owner decision "Leva de 3 a 5 minutos."): the real `open_free_account`
// stores one message, in pt-BR, with the handoff step "intro"; the list shows the reader's own language, in both layouts, and the range is in both.
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../messages/pt-BR.json";
import en from "../../../messages/en.json";
import { HANDOFF_COPY, handoffText, importedGreetingText } from "@/lib/equipe/handoff-copy";
import { executeCommand } from "@/server/equipe/module/commands";
import { makeTestDeps, uuid } from "@/server/equipe/module/testing/deps";
import AssistantMessageList, { type AssistantDisplayMessage } from "./AssistantMessageList";

vi.mock("@/lib/hooks/use-assistant-actions", () => ({ useConfirmAssistantAction: () => ({ mutate: vi.fn(), isPending: false }), useCancelAssistantAction: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("./EquipePlanOffer", () => ({ default: () => <div data-testid="plan-offer" /> }));
vi.mock("./EquipeCard", async (importOriginal) => ({ ...(await importOriginal<typeof import("./EquipeCard")>()), default: ({ card }: { card: { kind: string } }) => <div data-testid="equipe-card">{card.kind}</div> }));
afterEach(() => cleanup());

const LOCALES = { "pt-BR": ptBR, en } as const;
const RANGE = { "pt-BR": "Leva de 3 a 5 minutos.", en: "It takes 3 to 5 minutes." } as const;
const ORDER = { "pt-BR": ["Oi!", "Sou o Estrategista do ADScale.", "Antes de criar qualquer coisa", "Leva de 3 a 5 minutos."], en: ["Hi!", "I am the ADScale Strategist.", "Before creating anything", "It takes 3 to 5 minutes."] } as const;

async function openAccount(options: { paid?: boolean } = {}) {
  const t = makeTestDeps();
  const workspaceId = uuid(), userId = `user-${uuid()}`;
  t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "a@x.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
  if (options.paid) {
    const profile = await t.deps.uow.internal.createClientProfile(workspaceId, "Marca paga");
    await t.deps.uow.repos.accounts.create(workspaceId, { clientProfileId: profile.id });
  }
  const open = () => executeCommand(t.deps, { actor: { kind: "system", job: "free-open" }, workspaceId }, { type: "open_free_account", payload: { userId } });
  const outcome = await open();
  if (!outcome.ok) throw new Error(outcome.error.code);
  const stored = () => [...t.store.assistantMessages.rows.values()]; // In the order they were written.
  return { t, open, stored, scope: { workspaceId, accountId: outcome.value.accountId! } };
}
const display = (m: { id: string; type: string; content: string; payload: Record<string, unknown> | null }): AssistantDisplayMessage =>
  ({ id: m.id, type: m.type as AssistantDisplayMessage["type"], content: m.content, payload: (m.payload ?? {}) as AssistantDisplayMessage["payload"], createdAt: "2026-10-01T10:00:00.000Z" });

describe("what the account stores", () => {
  it("one message, the pt-BR line with handoffStep intro, before the source card", async () => {
    const a = await openAccount();
    const [first, second] = a.stored();
    expect(a.stored()).toHaveLength(2);
    expect(first).toMatchObject({ type: "assistant", content: HANDOFF_COPY["pt-BR"].intro, payload: { handoffStep: "intro" } });
    expect(first!.content).toBe("Oi! Sou o Estrategista do ADScale. Antes de criar qualquer coisa, vou conhecer a sua marca. Leva de 3 a 5 minutos.");
    expect(second).toMatchObject({ type: "equipe_card", payload: expect.objectContaining({ kind: "handoff", step: "source" }) });
  });

  it("reopening, and redelivering every event of the account, never repeats it", async () => {
    const a = await openAccount();
    await a.open(); await a.open();
    expect(a.stored().filter(m => m.payload?.handoffStep === "intro")).toHaveLength(1);
    // Delivering the same source event again (the outbox is at-least-once) writes no second message.
    const { projectConversationEvent } = await import("@/server/equipe/module/conversation-events");
    const events = await a.t.deps.uow.repos.events.list(a.scope, { eventType: "account.free_intro" });
    expect(events).toHaveLength(1);
    await a.t.deps.uow.run(async (repos) => { for (let i = 0; i < 3; i++) await projectConversationEvent({ ...a.t.deps, repos, workspaceId: a.scope.workspaceId, accountId: a.scope.accountId } as never, events[0]!); });
    expect(a.stored().filter(m => m.payload?.handoffStep === "intro")).toHaveLength(1);
  });

  it("an account that is not free gets no opening line", async () => {
    const a = await openAccount({ paid: true });
    expect(a.stored().some(m => m.payload?.handoffStep === "intro")).toBe(false);
  });
});

describe("what the screen shows", () => {
  for (const variant of ["classic", "rail"] as const) for (const locale of ["pt-BR", "en"] as const) {
    it(`${variant}, ${locale}: the stored message reads in the reader's language, with the range, once`, async () => {
      const a = await openAccount();
      const messages = a.stored().map(display);
      render(
        <NextIntlClientProvider locale={locale} messages={LOCALES[locale]}>
          <AssistantMessageList messages={messages} streamingText="" isStreaming={false} threadId="t1" variant={variant} />
        </NextIntlClientProvider>,
      );
      const text = screen.getByTestId("assistant-message-assistant").textContent ?? screen.getAllByText(LOCALES[locale].assistant.handoff.introText)[0]!.textContent!;
      expect(text).toContain(LOCALES[locale].assistant.handoff.introText);
      expect(text).toContain(RANGE[locale]);
      expect(screen.getAllByText(RANGE[locale], { exact: false })).toHaveLength(1);
      // Never the other language's line, and never a word of the stored pt-BR text when reading in English.
      if (locale === "en") { expect(document.body.textContent).not.toContain("Leva de 3 a 5 minutos"); expect(document.body.textContent).not.toContain("Estrategista"); }
    });
  }
});

describe("the two copies of the line agree", () => {
  it.each(["pt-BR", "en"] as const)("%s: stored copy = screen copy, four sentences in the same order, and the range last", (locale) => {
    const line = handoffText("intro", locale);
    expect(line).toBe(LOCALES[locale].assistant.handoff.introText);
    const positions = ORDER[locale].map(part => line.indexOf(part));
    expect(positions.every(p => p >= 0)).toBe(true);
    expect([...positions].sort((x, y) => x - y)).toEqual(positions); // The order of the sentences is the same.
    expect(line.endsWith(RANGE[locale])).toBe(true);
    expect(line.split(RANGE[locale])).toHaveLength(2); // Said once.
  });
  it("both languages promise the same range", () => {
    expect(handoffText("intro", "pt-BR").match(/\b3\b.*\b5\b/)).not.toBeNull();
    expect(handoffText("intro", "en").match(/\b3\b.*\b5\b/)).not.toBeNull();
  });
});

// Task 16: a brand that enters by import (a paying workspace, a Brand Kit) opens with the Strategist's greeting instead: stored
// once in pt-BR with the brand's name, shown in the reader's language like the opening line.
describe("the greeting of a brand that enters by import", () => {
  async function importBrand(name = "CENBRAP") {
    const t = makeTestDeps();
    const workspaceId = uuid(), userId = `user-${uuid()}`, brand = uuid();
    t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "a@x.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
    t.gateway.addProfile({ id: brand, workspaceId, name, brandColors: ["#123456"] });
    t.deps.hasClassicPaidAccess = async () => true;
    const outcome = await executeCommand(t.deps, { actor: { kind: "system", job: "free-open" }, workspaceId }, { type: "open_free_account", payload: { userId, clientProfileId: brand } });
    if (!outcome.ok) throw new Error(outcome.error.code);
    return [...t.store.assistantMessages.rows.values()];
  }
  const screenLine = (locale: keyof typeof LOCALES, brand: string) => LOCALES[locale].assistant.handoff.importedText.replace("{brand}", brand);

  it("the account stores the pt-BR line, naming the brand", async () => {
    expect(await importBrand()).toEqual([expect.objectContaining({ type: "assistant", content: importedGreetingText("CENBRAP"), payload: { handoffStep: "imported", brandName: "CENBRAP" } })]);
  });

  for (const variant of ["classic", "rail"] as const) for (const locale of ["pt-BR", "en"] as const) {
    it(`${variant}, ${locale}: the stored message reads in the reader's language, with the brand's name, once`, async () => {
      const messages = (await importBrand()).map(display);
      render(
        <NextIntlClientProvider locale={locale} messages={LOCALES[locale]}>
          <AssistantMessageList messages={messages} streamingText="" isStreaming={false} threadId="t1" variant={variant} />
        </NextIntlClientProvider>,
      );
      expect(screen.getAllByText(screenLine(locale, "CENBRAP"), { exact: false })).toHaveLength(1);
      expect(screen.queryByText(LOCALES[locale].assistant.empty.threadTitle)).toBeNull();
      if (locale === "en") expect(document.body.textContent).not.toContain("Li o Brand Kit");
    });
  }

  it.each(["pt-BR", "en"] as const)("%s: stored copy = screen copy, with the brand's name in place", (locale) => {
    expect(importedGreetingText("CENBRAP", locale)).toBe(screenLine(locale, "CENBRAP"));
    expect(importedGreetingText("CENBRAP", locale)).toContain("CENBRAP");
    expect(importedGreetingText("CENBRAP", locale)).not.toMatch(/\bEquipe\b|Est[uú]dio|Studio/);
  });

  it("a name with replacement patterns is cited as written", () => {
    expect(importedGreetingText("A$&B $1")).toContain("da marca A$&B $1 e");
  });
});
