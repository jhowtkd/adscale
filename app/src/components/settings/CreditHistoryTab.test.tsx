import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import CreditHistoryTab from "./CreditHistoryTab";
import ptMessages from "../../../messages/pt-BR.json";

vi.mock("@/lib/hooks/use-billing", () => ({
  useCreditHistory: vi.fn(),
  useBillingStatus: vi.fn(),
}));

import { useBillingStatus, useCreditHistory } from "@/lib/hooks/use-billing";

const mockUseCreditHistory = vi.mocked(useCreditHistory);
const mockUseBillingStatus = vi.mocked(useBillingStatus);

// New keys proposed to the translations owner (C); overlaid here until the
// JSONs incorporate them so this test runs against the real catalog.
const messages = {
  ...ptMessages,
  creditHistory: {
    ...ptMessages.creditHistory,
    unlimited: "Ilimitado",
    unlimitedHint:
      "Seu acesso é ilimitado. O uso é registrado sem débito de créditos.",
    movementsNote:
      "Esta tabela lista movimentações de créditos, não todos os eventos de uso.",
  },
};

function historyData() {
  return {
    grants: [],
    transactions: [],
    summary: {
      totalSpent: 0,
      remainingCredits: 80,
      averagePerCampaign: 0,
      transactionCount: 0,
    },
    campaigns: [],
  };
}

function renderTab() {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <CreditHistoryTab />
    </NextIntlClientProvider>
  );
}

describe("CreditHistoryTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreditHistory.mockReturnValue({
      data: historyData(),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useCreditHistory>);
    mockUseBillingStatus.mockReturnValue({
      data: {
        access: { kind: "paid", unlimited: false },
        creditBalance: 80,
      },
    } as ReturnType<typeof useBillingStatus>);
  });

  it("renders human labels instead of raw message keys", () => {
    renderTab();

    expect(screen.getByText("Este mês")).toBeVisible();
    expect(screen.queryByText(/^thisMonth$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^all$/)).not.toBeInTheDocument();
    expect(screen.getByText("Todas as campanhas")).toBeInTheDocument();
  });

  it("sends full ISO datetimes, not date-only fragments", () => {
    renderTab();

    const params = mockUseCreditHistory.mock.calls[0][0] as
      | { from?: string; to?: string }
      | undefined;
    expect(params?.from).toMatch(/T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(params?.to).toMatch(/T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // "to" covers the current local day to its last millisecond.
    const toLocal = new Date(params?.to as string);
    const now = new Date();
    expect(toLocal.getFullYear()).toBe(now.getFullYear());
    expect(toLocal.getMonth()).toBe(now.getMonth());
    expect(toLocal.getDate()).toBe(now.getDate());
  });

  it("shows unlimited instead of a numeric balance for unlimited access", () => {
    mockUseBillingStatus.mockReturnValue({
      data: {
        access: { kind: "tester", unlimited: true },
        creditBalance: 999999,
      },
    } as ReturnType<typeof useBillingStatus>);
    renderTab();

    expect(screen.getByText("Ilimitado")).toBeVisible();
    expect(screen.getByText(/uso é registrado sem débito/i)).toBeVisible();
    expect(screen.queryByText("999999")).not.toBeInTheDocument();
  });

  it("shows the numeric balance for regular workspaces", () => {
    renderTab();

    expect(screen.getByText("80")).toBeVisible();
    expect(screen.queryByText(/ilimitado/i)).not.toBeInTheDocument();
  });

  it("clarifies that the table lists credit movements", () => {
    renderTab();

    expect(screen.getByText(/movimentações de créditos/i)).toBeVisible();
  });

  it("separates empty, loading, and error states", () => {
    const { unmount } = renderTab();
    expect(screen.getByText("Nenhuma transação encontrada")).toBeInTheDocument();
    unmount();

    mockUseCreditHistory.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useCreditHistory>);
    const loading = render(
      <NextIntlClientProvider locale="pt-BR" messages={messages}>
        <CreditHistoryTab />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("Carregando...")).toBeInTheDocument();
    loading.unmount();

    mockUseCreditHistory.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useCreditHistory>);
    render(
      <NextIntlClientProvider locale="pt-BR" messages={messages}>
        <CreditHistoryTab />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("Erro")).toBeInTheDocument();
  });
});
