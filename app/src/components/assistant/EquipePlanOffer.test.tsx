import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EquipePlanOffer from "./EquipePlanOffer";
import { assistantThreadQueryKey } from "@/lib/hooks/use-assistant-threads";
import ptBR from "../../../messages/pt-BR.json";
import en from "../../../messages/en.json";

const mockRequestSupport = vi.fn();

vi.mock("@/lib/equipe/commands", () => ({
  requestEquipeSupport: (...args: unknown[]) => mockRequestSupport(...args),
}));

/**
 * Real messages, not a `useTranslations` key-identity mock: this file
 * verifies the actual copy shown to the client, not just that some string
 * rendered. Ticket 02's hard rule is "sem preço" — that only means
 * something if we check the real pt-BR/en text, not translation keys.
 */
function renderWithProviders(
  ui: React.ReactElement,
  { messages = ptBR, locale = "pt-BR", client }: { messages?: typeof ptBR; locale?: string; client?: QueryClient } = {},
) {
  const queryClient = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    ...render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
      </NextIntlClientProvider>,
    ),
  };
}

const NO_PRICE_PATTERN = /r\$|\$\s?\d|pre[çc]o|price|valor mensal|mensalidade|por m[êe]s|\/\s?m[êe]s|\/\s?mo\b/i;

describe("EquipePlanOffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["pt-BR", ptBR],
    ["en", en],
  ] as const)("renders the real %s plan copy with no price anywhere", (locale, messages) => {
    renderWithProviders(<EquipePlanOffer accountId="account-1" threadId="thread-1" />, { messages, locale });

    const card = screen.getByTestId("equipe-plan-offer");
    expect(card).toHaveTextContent(messages.assistant.equipe.plan.title);
    expect(card).toHaveTextContent(messages.assistant.equipe.plan.intro);
    expect(card.textContent).not.toMatch(NO_PRICE_PATTERN);
  });

  it('calls requestEquipeSupport(accountId, {purpose: "plan"}) on "Assinar o plano", then shows the requested confirmation copy', async () => {
    mockRequestSupport.mockResolvedValue({});
    const { queryClient } = renderWithProviders(
      <EquipePlanOffer accountId="account-1" threadId="thread-1" />,
    );
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    fireEvent.click(screen.getByRole("button", { name: ptBR.assistant.equipe.plan.subscribe }));

    expect(mockRequestSupport).toHaveBeenCalledWith("account-1", { purpose: "plan" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: ptBR.assistant.equipe.plan.requested })).toBeInTheDocument(),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: assistantThreadQueryKey("thread-1") });
    expect(screen.getByRole("status")).toHaveTextContent(ptBR.assistant.equipe.plan.confirmation);
    expect(screen.getByRole("status").textContent).not.toMatch(NO_PRICE_PATTERN);
  });

  it("is idempotent: a second click while requested does not call requestEquipeSupport again", async () => {
    mockRequestSupport.mockResolvedValue({});
    renderWithProviders(<EquipePlanOffer accountId="account-1" threadId="thread-1" />);

    fireEvent.click(screen.getByRole("button", { name: ptBR.assistant.equipe.plan.subscribe }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: ptBR.assistant.equipe.plan.requested })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: ptBR.assistant.equipe.plan.requested }));
    expect(mockRequestSupport).toHaveBeenCalledTimes(1);
  });

  it("shows the real error copy and stays retryable when the request fails", async () => {
    mockRequestSupport.mockRejectedValue(new Error("network"));
    renderWithProviders(<EquipePlanOffer accountId="account-1" threadId="thread-1" />);

    fireEvent.click(screen.getByRole("button", { name: ptBR.assistant.equipe.plan.subscribe }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ptBR.assistant.equipe.plan.error);
    expect(screen.getByRole("button", { name: ptBR.assistant.equipe.plan.subscribe })).toBeEnabled();
  });

  it('sends "Agora não" as a suggestion (continueMessage), never as a support request', () => {
    const onSuggestion = vi.fn();
    renderWithProviders(
      <EquipePlanOffer accountId="account-1" threadId="thread-1" onSuggestion={onSuggestion} />,
    );

    fireEvent.click(screen.getByRole("button", { name: ptBR.assistant.equipe.plan.later }));

    expect(onSuggestion).toHaveBeenCalledWith(ptBR.assistant.equipe.plan.continueMessage);
    expect(mockRequestSupport).not.toHaveBeenCalled();
  });

  // Ticket 13, T8 of the screen review: when the free conversation cannot go on, "Agora não" is not "carry on for free": it sends the phrase the conversation
  // answers with its fixed line, in the reader's language.
  it.each([
    ["pt-BR", "free_budget_exhausted", "Agora não"],
    ["pt-BR", "diagnosis_budget_exceeded", "Agora não"],
    ["en", "free_budget_exhausted", "Not now"],
    ["en", "diagnosis_budget_exceeded", "Not now"],
  ] as const)("%s, reason %s: 'Agora não' sends %p, not the invitation to carry on for free", (locale, reason, phrase) => {
    const messages = locale === "en" ? en : ptBR;
    const onSuggestion = vi.fn();
    renderWithProviders(<EquipePlanOffer accountId="account-1" threadId="thread-1" reason={reason} onSuggestion={onSuggestion} />, { messages, locale });

    fireEvent.click(screen.getByRole("button", { name: messages.assistant.equipe.plan.later }));

    expect(onSuggestion).toHaveBeenCalledExactlyOnceWith(phrase);
    expect(onSuggestion).not.toHaveBeenCalledWith(messages.assistant.equipe.plan.continueMessage);
    expect(mockRequestSupport).not.toHaveBeenCalled();
  });

  it.each([undefined, "another reason"])("keeps the invitation to carry on for the card offered for reason %s", (reason) => {
    const onSuggestion = vi.fn();
    renderWithProviders(<EquipePlanOffer accountId="account-1" threadId="thread-1" reason={reason} onSuggestion={onSuggestion} />);

    fireEvent.click(screen.getByRole("button", { name: ptBR.assistant.equipe.plan.later }));

    expect(onSuggestion).toHaveBeenCalledExactlyOnceWith(ptBR.assistant.equipe.plan.continueMessage);
  });

  it("disables both actions when disabled is true", () => {
    renderWithProviders(
      <EquipePlanOffer accountId="account-1" threadId="thread-1" disabled onSuggestion={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: ptBR.assistant.equipe.plan.subscribe })).toBeDisabled();
    expect(screen.getByRole("button", { name: ptBR.assistant.equipe.plan.later })).toBeDisabled();
  });

  it("disables the later button without an onSuggestion handler", () => {
    renderWithProviders(<EquipePlanOffer accountId="account-1" threadId="thread-1" />);

    expect(screen.getByRole("button", { name: ptBR.assistant.equipe.plan.later })).toBeDisabled();
  });

  // Ticket 13, D-12: the credit ended before there was a diagnosis, so the intro cannot say the diagnosis is the person's.
  it.each([
    ["pt-BR", ptBR],
    ["en", en],
  ] as const)("introduces the card honestly when the credit ended before the diagnosis (%s): no claim that a diagnosis exists", (locale, messages) => {
    renderWithProviders(<EquipePlanOffer accountId="account-1" threadId="thread-1" reason="diagnosis_budget_exceeded" />, { messages, locale });

    const card = screen.getByTestId("equipe-plan-offer");
    expect(card).toHaveTextContent(messages.assistant.equipe.plan.introBudget);
    expect(card).not.toHaveTextContent(messages.assistant.equipe.plan.intro);
    expect(card.textContent).not.toMatch(/diagnosis and Library remain yours|diagnóstico e a Biblioteca continuam seus/);
    expect(card.textContent).not.toMatch(NO_PRICE_PATTERN);
    // The plan request itself is the same one.
    expect(card).toHaveTextContent(messages.assistant.equipe.plan.title);
  });

  it.each([undefined, "free_budget_exhausted", "anything else"])("keeps the usual intro for reason %s", (reason) => {
    renderWithProviders(<EquipePlanOffer accountId="account-1" threadId="thread-1" reason={reason} />);

    expect(screen.getByTestId("equipe-plan-offer")).toHaveTextContent(ptBR.assistant.equipe.plan.intro);
    expect(screen.getByTestId("equipe-plan-offer")).not.toHaveTextContent(ptBR.assistant.equipe.plan.introBudget);
  });

  it("still sends the plan request for the card offered because the credit ended", async () => {
    mockRequestSupport.mockResolvedValue({});
    renderWithProviders(<EquipePlanOffer accountId="account-1" threadId="thread-1" reason="diagnosis_budget_exceeded" />);

    fireEvent.click(screen.getByRole("button", { name: ptBR.assistant.equipe.plan.subscribe }));

    expect(mockRequestSupport).toHaveBeenCalledWith("account-1", { purpose: "plan" });
    await waitFor(() => expect(screen.getByRole("button", { name: ptBR.assistant.equipe.plan.requested })).toBeInTheDocument());
  });

  // Ticket 13, T6 of the screen review: a disabled button drops the focus to the page, so the confirmation takes it.
  it("moves the focus to the confirmation once the plan was requested, instead of leaving it on a disabled button", async () => {
    mockRequestSupport.mockResolvedValue({});
    renderWithProviders(<EquipePlanOffer accountId="account-1" threadId="thread-1" />);
    const button = screen.getByRole("button", { name: ptBR.assistant.equipe.plan.subscribe });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole("status")).toHaveFocus());
    expect(screen.getByRole("status")).toHaveTextContent(ptBR.assistant.equipe.plan.confirmation);
    expect(document.body).not.toHaveFocus();
  });

  it("gives the focus back to the button when the request fails", async () => {
    mockRequestSupport.mockRejectedValue(new Error("network"));
    renderWithProviders(<EquipePlanOffer accountId="account-1" threadId="thread-1" />);
    fireEvent.click(screen.getByRole("button", { name: ptBR.assistant.equipe.plan.subscribe }));
    await screen.findByRole("alert");
    await waitFor(() => expect(screen.getByRole("button", { name: ptBR.assistant.equipe.plan.subscribe })).toHaveFocus());
  });
});
