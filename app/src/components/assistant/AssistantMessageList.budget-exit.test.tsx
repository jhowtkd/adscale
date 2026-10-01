// A whole conversation of a free account whose credit ended before the diagnosis (ticket 13, D-12): [the failed diagnosis card, the plan card], in both layouts and
// both languages, with the REAL cards and the REAL module behind the buttons. Only the newest failed-diagnosis card offers the way to a person; the plan card
// says the honest thing; and clicking both buttons in a row leaves one request on the server.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AssistantMessageList from "./AssistantMessageList";
import ptBR from "../../../messages/pt-BR.json";
import en from "../../../messages/en.json";
import { executeCommand } from "@/server/equipe/module/commands";
import { makeTestDeps } from "@/server/equipe/module/testing/deps";
import { advancingClock, confirmedHandoff } from "@/server/equipe/module/testing/diagnosis";

vi.mock("./markdown-lite", () => ({ renderMarkdownLite: (value: string) => value }));
vi.mock("./AssistantEmptyState", () => ({ default: () => <div data-testid="assistant-thread-empty-state" /> }));
vi.mock("@/lib/hooks/use-assistant-actions", () => ({ useConfirmAssistantAction: () => ({ mutate: vi.fn(), isPending: false }), useCancelAssistantAction: () => ({ mutate: vi.fn(), isPending: false }) }));
const mockRequestSupport = vi.fn();
vi.mock("@/lib/equipe/commands", () => ({ requestEquipeSupport: (...args: unknown[]) => mockRequestSupport(...args) }));
vi.mock("@/lib/equipe/use-equipe", () => ({ useEquipeAccountState: () => ({ data: { planAvailable: true }, isLoading: false, error: null }) }));
beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

const LOCALES = { "pt-BR": ptBR, en } as const;
const failure = (id: string, code: string | null = "budget_exceeded") => ({ id, type: "equipe_card" as const, content: "Diagnóstico da marca · não foi possível montar", createdAt: "2026-10-01T10:00:00.000Z",
  payload: { kind: "diagnosis", status: "failed", accountId: "acc-1", title: "Diagnóstico da marca", items: [], suggestions: [], ...(code !== null ? { failureCode: code } : {}) } });
const planCard = (id: string, reason?: string) => ({ id, type: "equipe_card" as const, content: "Continue com a equipe", createdAt: "2026-10-01T10:00:01.000Z",
  payload: { kind: "plan_offer", accountId: "acc-1", title: "Continue com a equipe", items: [], ...(reason ? { reason } : {}) } });
const user = (id: string, content: string) => ({ id, type: "user" as const, content, payload: {}, createdAt: "2026-10-01T10:00:02.000Z" });

function renderList(messages: unknown[], variant: "classic" | "rail", locale: "pt-BR" | "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={LOCALES[locale]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AssistantMessageList messages={messages as never} streamingText="" isStreaming={false} threadId="thread-1" equipeEnabled onSuggestion={vi.fn()} variant={variant} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe.each(["classic", "rail"] as const)("%s layout", (variant) => describe.each(["pt-BR", "en"] as const)("%s", (locale) => {
  const copy = LOCALES[locale].assistant.equipe;
  it("[failure card, plan card]: the card says the credit ended, offers the way to a person once, and the plan card does not claim the diagnosis is ready", () => {
    renderList([failure("f1"), planCard("p1", "diagnosis_budget_exceeded")], variant, locale);
    expect(screen.getByTestId("equipe-diagnosis")).toHaveTextContent(copy.diagnosis.budgetIntro);
    expect(screen.queryByText(copy.diagnosis.failedIntro)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: copy.diagnosis.talkToPerson })).toHaveLength(1);
    const offer = screen.getByTestId("equipe-plan-offer");
    expect(offer).toHaveTextContent(copy.plan.introBudget);
    expect(offer).not.toHaveTextContent(copy.plan.intro);
  });

  it("an older failure card is history: only the NEWEST one offers the button (3 failure cards, one button)", () => {
    renderList([failure("f1"), user("u1", "oi"), failure("f2"), user("u2", "oi"), failure("f3")], variant, locale);
    expect(screen.getAllByTestId("equipe-diagnosis")).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: copy.diagnosis.talkToPerson })).toHaveLength(1);
    expect(screen.getAllByTestId("diagnosis-budget-exit")).toHaveLength(1);
    // The one that offers it is the last card of the conversation.
    const cards = screen.getAllByTestId("equipe-diagnosis");
    expect(cards.at(-1)!.querySelector('[data-testid="diagnosis-budget-exit"]')).not.toBeNull();
    expect(cards[0]!.querySelector('[data-testid="diagnosis-budget-exit"]')).toBeNull();
  });

  it("a failure for another reason keeps the generic line and offers no way out of its own", () => {
    for (const code of ["provider_error", "diagnosis_invalid", "model_refused", null, "BUDGET_EXCEEDED"]) {
      const { unmount } = renderList([failure("f1", code)], variant, locale);
      expect(screen.queryByRole("button", { name: copy.diagnosis.talkToPerson }), String(code)).not.toBeInTheDocument();
      expect(screen.getByTestId("equipe-diagnosis")).toHaveTextContent(copy.diagnosis.failedIntro);
      expect(screen.getByTestId("equipe-diagnosis")).not.toHaveTextContent(copy.diagnosis.budgetIntro);
      unmount();
    }
  });

  it("a plan card without the reason keeps its ordinary introduction (an older conversation), and an unknown reason too", () => {
    for (const reason of [undefined, "free_budget_exhausted", "something_else", ""]) {
      const { unmount } = renderList([planCard("p1", reason)], variant, locale);
      expect(screen.getByTestId("equipe-plan-offer")).toHaveTextContent(copy.plan.intro);
      expect(screen.getByTestId("equipe-plan-offer")).not.toHaveTextContent(copy.plan.introBudget);
      unmount();
    }
  });
}));

describe("the two buttons ask the same thing, once, whatever the order or the count", () => {
  async function blockedAccount() {
    const f = await confirmedHandoff(makeTestDeps());
    advancingClock(f.t);
    await executeCommand(f.t.deps, { workspaceId: f.workspaceId, accountId: f.accountId, actor: { kind: "system", job: "equipe.handoff.diagnose" } }, { type: "diagnosis_fail", payload: { taskIntentId: f.taskIntentId, code: "budget_exceeded" } });
    const asApprover = { workspaceId: f.workspaceId, accountId: f.accountId, actor: f.approver };
    mockRequestSupport.mockImplementation(async (_accountId: string, input: { purpose?: "plan" }) => {
      const out = await executeCommand(f.t.deps, asApprover, { type: "request_support", payload: { purpose: input.purpose } });
      if (!out.ok) throw new Error(out.error.code);
      return out.value.data;
    });
    const requests = async () => (await f.t.deps.uow.repos.exceptions.list(f.scope)).filter(row => row.trigger === "out_of_contract_request");
    return { f, requests };
  }
  const talk = ptBR.assistant.equipe.diagnosis.talkToPerson, subscribe = ptBR.assistant.equipe.plan.subscribe;

  it.each([["failure card first", "talk", "subscribe"], ["plan card first", "subscribe", "talk"], ["failure card twice", "talk", "talk"], ["plan card twice", "subscribe", "subscribe"]] as const)(
    "%s: the module takes one plan request, both answers are ok", async (_name, first, second) => {
      const { requests } = await blockedAccount();
      renderList([failure("f1"), planCard("p1", "diagnosis_budget_exceeded")], "classic", "pt-BR");
      const click = (which: "talk" | "subscribe") => fireEvent.click(screen.getByRole("button", { name: which === "talk" ? talk : subscribe }));
      click(first);
      await waitFor(() => expect(mockRequestSupport).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getAllByRole("button", { name: ptBR.assistant.equipe.plan.requested })[0]).toBeDisabled());
      // The second control: either still there (the other card) or already done (the same card).
      const again = screen.queryByRole("button", { name: second === "talk" ? talk : subscribe });
      if (again && !again.hasAttribute("disabled")) { fireEvent.click(again); await waitFor(() => expect(mockRequestSupport).toHaveBeenCalledTimes(2)); }
      await waitFor(async () => expect(await requests()).toHaveLength(1));
      const results = await Promise.all(mockRequestSupport.mock.results.map(r => r.value as Promise<{ exceptionId?: string }>));
      const ids = new Set(results.map(result => result.exceptionId));
      expect(ids.size).toBe(1); // Every answer names the same request.
    });

  it("a request that fails shows the error on the card that asked, never says 'requested', and can be asked again", async () => {
    mockRequestSupport.mockRejectedValueOnce(new Error("down")).mockResolvedValue({ exceptionId: "e1" });
    renderList([failure("f1")], "classic", "pt-BR");
    fireEvent.click(screen.getByRole("button", { name: talk }));
    await waitFor(() => expect(mockRequestSupport).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: talk })).toBeEnabled());
    expect(screen.queryByRole("button", { name: ptBR.assistant.equipe.plan.requested })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: talk }));
    await waitFor(() => expect(mockRequestSupport).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: ptBR.assistant.equipe.plan.requested })).toBeDisabled());
  });
});
