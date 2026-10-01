// The diagnosis that failed because the free credit ended (ticket 13, D-12): the card says why, and the person has a way to a person that needs no model.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DiagnosisCard from "./DiagnosisCard";
import EquipePlanOffer from "./EquipePlanOffer";
import { parseEquipeCard } from "./EquipeCard";
import { assistantThreadQueryKey } from "@/lib/hooks/use-assistant-threads";
import ptBR from "../../../messages/pt-BR.json";
import en from "../../../messages/en.json";
import type { EquipeCardPayload } from "@/server/repositories/assistant-types";

const mockRequestSupport = vi.fn();
vi.mock("@/lib/equipe/commands", () => ({ requestEquipeSupport: (...args: unknown[]) => mockRequestSupport(...args) }));
const mockUseEquipeAccountState = vi.fn();
vi.mock("@/lib/equipe/use-equipe", () => ({ useEquipeAccountState: (...args: unknown[]) => mockUseEquipeAccountState(...args) }));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseEquipeAccountState.mockReturnValue({ data: undefined, isLoading: false });
});

const failed = (failureCode?: string, overrides: Partial<EquipeCardPayload> = {}): EquipeCardPayload => ({
  kind: "diagnosis", status: "failed", accountId: "acc-1", title: "Diagnóstico da marca", items: [], suggestions: [],
  ...(failureCode ? { failureCode } : {}), ...overrides,
});

function renderCard(card: EquipeCardPayload, props: Partial<{ latest: boolean; disabled: boolean; locale: "pt-BR" | "en" }> = {}) {
  const { locale = "pt-BR", ...rest } = props;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, ...render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : ptBR}>
      <QueryClientProvider client={client}>
        <DiagnosisCard card={card} threadId="thread-1" {...rest} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  ) };
}
const copy = ptBR.assistant.equipe.diagnosis;
const plan = ptBR.assistant.equipe.plan;

describe("a diagnosis that failed because the credit ended", () => {
  it("says so, instead of the generic line, and keeps telling that the account and the Library are safe", () => {
    renderCard(failed("budget_exceeded"));
    const root = screen.getByTestId("equipe-diagnosis");
    expect(within(root).getByText("O crédito grátis de IA da sua conta acabou, então não consegui montar o diagnóstico.")).toBeInTheDocument();
    expect(within(root).queryByText(copy.failedIntro)).not.toBeInTheDocument();
    expect(within(root).getAllByRole("status")[0]).toHaveTextContent("Sua conta e sua Biblioteca continuam disponíveis.");
  });

  it("offers 'Falar com uma pessoa', which sends the PLAN request and then confirms it; the thread is refreshed", async () => {
    mockRequestSupport.mockResolvedValue({});
    const { client } = renderCard(failed("budget_exceeded"));
    const invalidate = vi.spyOn(client, "invalidateQueries");
    expect(screen.getByTestId("diagnosis-budget-exit")).toHaveTextContent(copy.talkToPersonHint);
    fireEvent.click(screen.getByRole("button", { name: "Falar com uma pessoa" }));
    expect(mockRequestSupport).toHaveBeenCalledTimes(1);
    expect(mockRequestSupport).toHaveBeenCalledWith("acc-1", { purpose: "plan" });
    await waitFor(() => expect(screen.getByRole("button", { name: plan.requested })).toBeDisabled());
    expect(screen.getByTestId("diagnosis-budget-exit")).toHaveTextContent(plan.confirmation);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: assistantThreadQueryKey("thread-1") });
  });

  it("asks once: a second click on a request that was sent does nothing", async () => {
    mockRequestSupport.mockResolvedValue({});
    renderCard(failed("budget_exceeded"));
    fireEvent.click(screen.getByRole("button", { name: "Falar com uma pessoa" }));
    await waitFor(() => expect(screen.getByRole("button", { name: plan.requested })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: plan.requested }));
    expect(mockRequestSupport).toHaveBeenCalledTimes(1);
  });

  it("a request that did not go through says so and can be tried again", async () => {
    mockRequestSupport.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({});
    renderCard(failed("budget_exceeded"));
    fireEvent.click(screen.getByRole("button", { name: "Falar com uma pessoa" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(plan.error);
    expect(screen.getByRole("button", { name: "Falar com uma pessoa" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Falar com uma pessoa" }));
    await waitFor(() => expect(screen.getByRole("button", { name: plan.requested })).toBeDisabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("an OLD card (not the newest) tells why but offers nothing: a stale request is never sent", () => {
    renderCard(failed("budget_exceeded"), { latest: false });
    expect(screen.getByText("O crédito grátis de IA da sua conta acabou, então não consegui montar o diagnóstico.")).toBeInTheDocument();
    expect(screen.queryByTestId("diagnosis-budget-exit")).not.toBeInTheDocument();
  });

  it("is disabled while the conversation is busy", () => {
    renderCard(failed("budget_exceeded"), { disabled: true });
    expect(screen.getByRole("button", { name: "Falar com uma pessoa" })).toBeDisabled();
  });

  it.each([undefined, "provider_error", "model_truncated", "diagnosis_invalid", "model_refused", "execution_blocked", "diagnosis_unavailable", "something_new"])(
    "a failure that is not about the credit (%s) keeps the generic line and offers no request", (code) => {
      renderCard(failed(code, { suggestions: ["Tentar de novo"] }));
      const root = screen.getByTestId("equipe-diagnosis");
      expect(within(root).getByText(copy.failedIntro)).toBeInTheDocument();
      expect(within(root).queryByText(/crédito grátis/)).not.toBeInTheDocument();
      expect(screen.queryByTestId("diagnosis-budget-exit")).not.toBeInTheDocument();
      expect(within(root).queryByRole("button", { name: "Falar com uma pessoa" })).not.toBeInTheDocument();
    });

  it("a card that is not a failure never shows it, whatever code it carries", () => {
    renderCard({ kind: "diagnosis", status: "ready", accountId: "acc-1", title: "Diagnóstico da marca", items: [], documentId: "doc-1", summary: "Resumo.", failureCode: "budget_exceeded" });
    expect(screen.queryByTestId("diagnosis-budget-exit")).not.toBeInTheDocument();
  });

  it("tells it in English too", () => {
    renderCard(failed("budget_exceeded"), { locale: "en" });
    expect(screen.getByText("The free AI credit on your account ran out, so I could not build the diagnosis.")).toBeInTheDocument();
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("Your account and Library remain available.");
    expect(screen.getByRole("button", { name: "Talk to a person" })).toBeInTheDocument();
  });
});

describe("the stored card keeps the failure code the screen reads", () => {
  it("parseEquipeCard passes failureCode through for a failed diagnosis, and only a string", () => {
    const base = { kind: "diagnosis", status: "failed", accountId: "acc-1", title: "Diagnóstico da marca", items: [] };
    expect(parseEquipeCard({ ...base, failureCode: "budget_exceeded" })).toMatchObject({ status: "failed", failureCode: "budget_exceeded" });
    expect(parseEquipeCard({ ...base, failureCode: 42 })).not.toHaveProperty("failureCode");
    expect(parseEquipeCard(base)).not.toHaveProperty("failureCode");
  });
});

// The failure card and the plan card of the same conversation ask for the same thing: one request, one answer on both (ticket 13, D-12).
describe("the failure card and the plan card of the credit-ended account", () => {
  function both() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
        <QueryClientProvider client={client}>
          <DiagnosisCard card={failed("budget_exceeded")} threadId="thread-1" />
          <EquipePlanOffer accountId="acc-1" threadId="thread-1" reason="diagnosis_budget_exceeded" />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );
  }

  it("asking on the failure card shows 'Pedido enviado' on the plan card too, and the plan card sends nothing", async () => {
    mockRequestSupport.mockResolvedValue({});
    both();
    fireEvent.click(screen.getByRole("button", { name: "Falar com uma pessoa" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: plan.requested })).toHaveLength(2));
    for (const button of screen.getAllByRole("button", { name: plan.requested })) expect(button).toBeDisabled();
    expect(screen.queryByRole("button", { name: plan.subscribe })).not.toBeInTheDocument();
    expect(screen.getByTestId("equipe-plan-offer")).toHaveTextContent(plan.confirmation);
    expect(mockRequestSupport).toHaveBeenCalledTimes(1);
  });

  it("asking on the plan card shows it on the failure card too", async () => {
    mockRequestSupport.mockResolvedValue({});
    both();
    fireEvent.click(screen.getByRole("button", { name: plan.subscribe }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: plan.requested })).toHaveLength(2));
    expect(screen.getByTestId("diagnosis-budget-exit")).toHaveTextContent(plan.confirmation);
    expect(mockRequestSupport).toHaveBeenCalledTimes(1);
  });
});
