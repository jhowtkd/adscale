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
});
