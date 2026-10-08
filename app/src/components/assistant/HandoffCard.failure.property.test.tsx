// What the card says when a reading fails, as a property (ticket 13, D-10), complementing HandoffCard.failure.test.tsx: the notice and the retry exist only
// when the reading is over and something failed; the cause comes from the first failed group; the text never shows a raw code; and the sentence about
// cost agrees with what the module really does with the reading counter.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HandoffCard from "./HandoffCard";
import ptBR from "../../../messages/pt-BR.json";
import en from "../../../messages/en.json";
import { HANDOFF_GROUPS, UNBILLED_READING_ERRORS, type HandoffState } from "@/server/equipe/domain/handoff";
import { HANDOFF_READ_EVENT } from "@/server/equipe/handoff/contract";
import { executeCommand } from "@/server/equipe/module/commands";
import { makeTestDeps, uuid } from "@/server/equipe/module/testing/deps";

const mockUseEquipeAccountState = vi.fn();
vi.mock("@/lib/equipe/use-equipe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/equipe/use-equipe")>();
  return { ...actual, useEquipeAccountState: (...args: unknown[]) => mockUseEquipeAccountState(...args) };
});
vi.mock("@/lib/equipe/commands", () => ({ postEquipeCommand: vi.fn(), EquipeCommandError: class extends Error {} }));
vi.mock("@/lib/assistant/chat-attachments", () => {
  class MockChatAttachmentUploadError extends Error { constructor(message: string, readonly code?: string) { super(message); this.name = "ChatAttachmentUploadError"; } }
  return { uploadChatAttachment: vi.fn(), ChatAttachmentUploadError: MockChatAttachmentUploadError };
});
beforeEach(() => vi.clearAllMocks());

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(r: () => number, items: readonly T[]): T => items[Math.floor(r() * items.length)]!;

type Handoff = HandoffState & { id: string };
type Locale = "pt-BR" | "en";
const messages = { "pt-BR": ptBR, en } as const;
const failureText = (locale: Locale) => (messages[locale] as typeof ptBR).assistant.handoff.failure;
const retryLabel = (locale: Locale) => (messages[locale] as typeof ptBR).assistant.handoff.retry;

function renderCard(handoff: Handoff, locale: Locale) {
  mockUseEquipeAccountState.mockReturnValue({ data: { handoff }, isLoading: false, error: null, refetch: vi.fn() });
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <HandoffCard accountId="acc-1" handoffId={handoff.id} step={handoff.step} threadId="thread-1" />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const CODES = ["site_unavailable", "site_dns_or_address", "site_provider_dns", "invalid_site", "reader_unavailable", "reading_not_started", "reading_failed", "invalid_instagram",
  "instagram_private", "instagram_not_found", "monthly_budget_exceeded", "something_new", "", "SITE_UNAVAILABLE", "undefined", "[object Object]"] as const;
const STATUSES = ["pending", "running", "found", "not_found", "failed"] as const;
const CAUSE: Record<string, "unavailable" | "address" | "notFound" | "private" | "monthlyBudget" | "generic"> = { site_unavailable: "unavailable", instagram_not_found: "notFound", invalid_instagram: "notFound",
  instagram_private: "private", site_dns_or_address: "address", site_provider_dns: "address", invalid_site: "address", monthly_budget_exceeded: "monthlyBudget" };

function randomReading(r: () => number): Handoff {
  const kind = pick(r, ["site", "instagram"] as const);
  const mode = r();
  const status = (): (typeof STATUSES)[number] => (mode < 0.35 ? pick(r, ["found", "not_found", "failed", "failed"]) : pick(r, STATUSES));
  const reading = Object.fromEntries(HANDOFF_GROUPS.map(g => {
    const s = status();
    return [g, { runId: `r-${g}`, taskIntentId: "t", status: s, ...(s === "failed" && r() < 0.95 ? { error: pick(r, CODES) } : {}) }];
  }));
  return { id: "handoff-1", step: "reading", version: 3, readsUsed: Math.floor(r() * 4), readingId: "reading-1", decisions: {}, captured: {}, reading,
    source: kind === "site" ? { kind, value: "https://acme.com", normalized: "https://acme.com/" } : { kind, value: "acme", normalized: "acme" } } as Handoff;
}

describe("the failure notice over random readings", () => {
  it("shows the alert and the retry iff every group is over and one failed; the retry is disabled iff all 3 readings are used; the text never shows a code (400 random)", () => {
    const r = rng(10);
    const seen = { shown: 0, hidden: 0, limited: 0 };
    for (let i = 0; i < 400; i++) {
      const handoff = randomReading(r);
      const locale = pick(r, ["pt-BR", "en"] as const);
      const statuses = HANDOFF_GROUPS.map(g => handoff.reading[g]!.status);
      const over = statuses.every(s => ["found", "not_found", "failed"].includes(s));
      const failed = statuses.includes("failed");
      const { unmount } = renderCard(handoff, locale);
      const label = `${JSON.stringify(statuses)} reads=${handoff.readsUsed} ${handoff.source!.kind} ${locale}`;
      const alert = screen.queryByRole("alert");
      const retry = screen.queryByRole("button", { name: retryLabel(locale) });
      if (over && failed) {
        expect(alert, label).toBeInTheDocument();
        expect(retry, label).toBeInTheDocument();
        if (handoff.readsUsed >= 3) { expect(retry, label).toBeDisabled(); seen.limited++; } else expect(retry, label).toBeEnabled();
        const text = alert!.textContent ?? "";
        expect(text.trim().length).toBeGreaterThan(10);
        expect(text).not.toMatch(/undefined|\[object|null/);
        for (const code of CODES) if (code.length > 3 && !["undefined", "[object Object]"].includes(code)) expect(text, label).not.toContain(code);
        expect(text).not.toMatch(/[a-z]+_[a-z_]+/); // No snake_case identifier of ours either.
        if (handoff.readsUsed < 3) {
          const first = HANDOFF_GROUPS.map(g => handoff.reading[g]!).find(run => run.status === "failed")!;
          expect(text.startsWith(failureText(locale)[CAUSE[(first as { error?: string }).error ?? ""] ?? "generic"]), `${label} first=${(first as { error?: string }).error}`).toBe(true);
        }
        seen.shown++;
      } else {
        expect(alert, label).not.toBeInTheDocument();
        expect(retry, label).not.toBeInTheDocument();
        seen.hidden++;
      }
      unmount();
    }
    cleanup();
    expect(seen.shown).toBeGreaterThan(80);
    expect(seen.hidden).toBeGreaterThan(80);
    expect(seen.limited).toBeGreaterThan(10);
  }, 120_000);

  it("the cause is the FIRST failed group in HANDOFF_GROUPS order, never the last, whatever the others say (60 random)", () => {
    const r = rng(33);
    for (let i = 0; i < 60; i++) {
      const codes = ["site_unavailable", "site_dns_or_address", "reading_failed"] as const;
      const failing = shuffle(r, [...HANDOFF_GROUPS]).slice(0, 2 + Math.floor(r() * 4));
      const byGroup = new Map(failing.map(g => [g, pick(r, codes)]));
      const reading = Object.fromEntries(HANDOFF_GROUPS.map(g => [g, byGroup.has(g) ? { runId: "r", taskIntentId: "t", status: "failed", error: byGroup.get(g) } : { runId: "r", taskIntentId: "t", status: "found" }]));
      const first = HANDOFF_GROUPS.find(g => byGroup.has(g))!;
      const handoff = { ...randomReading(r), readsUsed: 1, reading, source: { kind: "site", value: "https://acme.com", normalized: "https://acme.com/" } } as unknown as Handoff;
      const { unmount } = renderCard(handoff, "pt-BR");
      expect(screen.getByRole("alert").textContent!.startsWith(failureText("pt-BR")[CAUSE[byGroup.get(first)!] ?? "generic"])).toBe(true);
      unmount();
    }
  });
});
function shuffle<T>(r: () => number, items: T[]) { return items.map(item => [r(), item] as const).sort((a, b) => a[0] - b[0]).map(([, item]) => item); }

describe("the sentence about cost tells what the module really does with the counter", () => {
  /** The real flow: set the source, make the reading's runs fail with this error through the module's own command, and render the row it leaves. */
  async function failedThroughTheModule(kind: "site" | "instagram", code: string, dispatched: boolean) {
    const t = makeTestDeps();
    const workspaceId = uuid(), userId = `user-${uuid()}`;
    t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "a@x.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
    const opened = await executeCommand(t.deps, { actor: { kind: "system", job: "free-open" }, workspaceId }, { type: "open_free_account", payload: { userId } });
    if (!opened.ok) throw new Error(opened.error.code);
    const scope = { workspaceId, accountId: opened.value.accountId! };
    const [person] = await t.deps.uow.repos.people.list(scope);
    const row = async () => (await t.deps.uow.repos.handoffs.list(scope))[0]!;
    const h0 = await row();
    const set = await executeCommand(t.deps, { ...scope, actor: { kind: "client_person", role: "approver", personId: person!.id } }, { type: "handoff_set_source",
      payload: { expectedStep: h0.step, expectedVersion: h0.version, kind, value: kind === "site" ? "https://acme.com" : "acme.oficial" } });
    if (!set.ok) throw new Error(set.error.code);
    const started = await row();
    const readsBefore = started.readsUsed;
    if (dispatched) await t.deps.uow.repos.events.create(scope, { actorType: "system", actorId: HANDOFF_READ_EVENT, actorRole: "system", eventType: `handoff.${kind}_dispatched`,
      payload: { taskIntentId: started.reading[HANDOFF_GROUPS[0]]!.taskIntentId, readingId: started.readingId }, occurredAt: new Date() });
    for (const group of HANDOFF_GROUPS) {
      const h = await row(); const g = h.reading[group]!;
      const out = await executeCommand(t.deps, { ...scope, actor: { kind: "system", job: HANDOFF_READ_EVENT } }, { type: "handoff_record_group",
        payload: { readingId: h.readingId!, runId: g.runId, taskIntentId: g.taskIntentId, group, result: { status: "failed", items: [], error: code } } });
      if (!out.ok) throw new Error(out.error.code);
    }
    const after = await row();
    return { handoff: after as Handoff, refunded: after.readsUsed === readsBefore - 1, charged: after.readsUsed === readsBefore };
  }

  const KINDS = ["site", "instagram"] as const;
  const REAL = ["site_unavailable", "site_dns_or_address", "site_provider_dns", "invalid_site", "reader_unavailable", "reading_not_started", "reading_failed", "invalid_instagram",
    "instagram_private", "instagram_not_found", "monthly_budget_exceeded", "something_new"] as const;
  // When the reader's error can happen: the supplier's own DNS answer only after the request was sent; our own preflight refusals before it; any other failure after it.
  const dispatchedWhenReal = (code: string) => !["site_dns_or_address", "invalid_site", "reader_unavailable", "reading_not_started", "invalid_instagram", "monthly_budget_exceeded"].includes(code);

  it.each(KINDS.flatMap(kind => REAL.map(code => [kind, code] as const)))("%s source, %s: the card says trying again is free iff the module gave the reading back", async (kind, code) => {
    const { handoff, refunded, charged } = await failedThroughTheModule(kind, code, dispatchedWhenReal(code));
    expect(refunded !== charged).toBe(true); // Exactly one of the two: the counter went down by one, or stayed.
    const { unmount } = renderCard({ ...handoff, readsUsed: Math.min(handoff.readsUsed, 2) }, "pt-BR");
    const text = screen.getByRole("alert").textContent!;
    const freeSentence = failureText("pt-BR").noCost, costSentence = failureText("pt-BR").cost;
    if (refunded) { expect(text).toContain(freeSentence); expect(text).not.toContain(costSentence); }
    else { expect(text).toContain(costSentence); expect(text).not.toContain(freeSentence); }
    unmount();
  });

  it("the known free failures are given back, the known charged ones are not (the table the card's sentence stands on)", async () => {
    const FREE: Array<["site" | "instagram", string, boolean]> = [["site", "reader_unavailable", false], ["site", "invalid_site", false], ["site", "site_dns_or_address", false],
      ["site", "reading_not_started", false], ["site", "site_provider_dns", true], ["instagram", "invalid_instagram", false], ["instagram", "reader_unavailable", false],
      // The monthly AI budget of a paying workspace's free brand was used up: the reading never started (spec 2026-10-07 §3).
      ["site", "monthly_budget_exceeded", false], ["instagram", "monthly_budget_exceeded", false]];
    const CHARGED: Array<["site" | "instagram", string, boolean]> = [["site", "site_unavailable", true], ["site", "reading_failed", true], ["site", "something_new", true],
      ["instagram", "instagram_private", true], ["instagram", "instagram_not_found", true], ["instagram", "reading_failed", true], ["instagram", "site_provider_dns", true]];
    for (const [kind, code, dispatched] of FREE) expect((await failedThroughTheModule(kind, code, dispatched)).refunded, `${kind} ${code}`).toBe(true);
    for (const [kind, code, dispatched] of CHARGED) expect((await failedThroughTheModule(kind, code, dispatched)).refunded, `${kind} ${code}`).toBe(false);
  });

  it("a site code under an Instagram source is not free there, and the module does not give the reading back either", async () => {
    for (const code of ["site_dns_or_address", "reading_not_started", "site_provider_dns", "invalid_site"]) {
      const { handoff, refunded } = await failedThroughTheModule("instagram", code, false);
      expect(refunded, code).toBe(false);
      const { unmount } = renderCard({ ...handoff, readsUsed: 1 }, "pt-BR");
      expect(screen.getByRole("alert").textContent).toContain(failureText("pt-BR").cost);
      unmount();
    }
  });

  it("every code the module gives back is on the card's list, and the card lists nothing the module keeps (over every code, kind and dispatch state)", async () => {
    for (const kind of KINDS) for (const code of REAL) for (const dispatched of [false, true]) {
      const { refunded } = await failedThroughTheModule(kind, code, dispatched);
      const listed = (UNBILLED_READING_ERRORS[kind] as readonly string[]).includes(code);
      if (refunded) expect(listed, `${kind} ${code} dispatched=${dispatched}`).toBe(true);
      if (listed && dispatchedWhenReal(code) === dispatched) expect(refunded, `${kind} ${code} dispatched=${dispatched}`).toBe(true);
      // The proof of "nothing was charged": our own preflight refusals before the request left, or the supplier's own DNS answer after it. A listed code in the
      // other state (a local error on resumption after the request left) says nothing about the earlier request: the reading stays charged.
      expect(refunded, `${kind} ${code} dispatched=${dispatched}`).toBe(listed && dispatched === (code === "site_provider_dns"));
    }
  });
});

describe("the failure texts exist in both languages", () => {
  const keys = (locale: Locale) => Object.keys(failureText(locale)).sort();
  it("has the same keys, none empty, in pt-BR and en", () => {
    expect(keys("en")).toEqual(keys("pt-BR"));
    expect(keys("pt-BR")).toEqual(["address", "cost", "generic", "monthlyBudget", "noCost", "notFound", "preserved", "private", "unavailable"]);
    for (const locale of ["pt-BR", "en"] as const) for (const [key, value] of Object.entries(failureText(locale))) {
      expect(typeof value, `${locale} ${key}`).toBe("string");
      expect(value.trim().length, `${locale} ${key}`).toBeGreaterThan(10);
      expect(value, `${locale} ${key}`).not.toMatch(/undefined|\{|\}|_/);
    }
  });
  it("tells cost, no cost and preserved apart, and every cause apart, in each language", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const t = failureText(locale);
      expect(new Set([t.cost, t.noCost, t.preserved]).size).toBe(3);
      expect(new Set([t.unavailable, t.address, t.notFound, t.private, t.monthlyBudget, t.generic]).size).toBe(6);
    }
    expect(failureText("en").cost).not.toBe(failureText("pt-BR").cost);
  });
});
