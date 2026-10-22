import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import CreditHistoryTab from "./CreditHistoryTab";
import ptMessages from "../../../messages/pt-BR.json";

// Minimal controlled select: the Base UI popup does not select under jsdom pointer events.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const Ctx = React.createContext<{
    open: boolean;
    setOpen: (open: boolean) => void;
    onValueChange: (value: string) => void;
  }>({ open: false, setOpen: () => {}, onValueChange: () => {} });
  return {
    Select: ({ children, onValueChange }: { children: React.ReactNode; onValueChange: (v: string) => void }) => {
      const [open, setOpen] = React.useState(false);
      return (
        <Ctx.Provider value={{ open, setOpen, onValueChange }}>
          <div>{children}</div>
        </Ctx.Provider>
      );
    },
    SelectTrigger: ({ children }: { children: React.ReactNode }) => {
      const ctx = React.useContext(Ctx);
      return (
        <button type="button" role="combobox" aria-controls="mock-listbox" aria-expanded={ctx.open} onClick={() => ctx.setOpen(!ctx.open)}>
          {children}
        </button>
      );
    },
    SelectValue: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => {
      const ctx = React.useContext(Ctx);
      return ctx.open ? <div role="listbox" id="mock-listbox">{children}</div> : null;
    },
    SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => {
      const ctx = React.useContext(Ctx);
      return (
        <div
          role="option"
          aria-selected={false}
          onClick={() => {
            ctx.onValueChange(value);
            ctx.setOpen(false);
          }}
        >
          {children}
        </div>
      );
    },
  };
});

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
    transactions: [],
    summary: {
      totalSpent: 0,
      remainingCredits: 80,
      averagePerCampaign: 0,
      transactionCount: 0,
    },
    usageSeries: [],
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
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      fetchNextPage: vi.fn(),
    } as unknown as ReturnType<typeof useCreditHistory>);
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

  function mockHistory(overrides: Record<string, unknown>) {
    mockUseCreditHistory.mockReturnValue({
      data: historyData(),
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      fetchNextPage: vi.fn(),
      ...overrides,
    } as unknown as ReturnType<typeof useCreditHistory>);
  }

  it("shows Carregar mais with a next page and fetches it on click", () => {
    const fetchNextPage = vi.fn();
    mockHistory({ hasNextPage: true, fetchNextPage });
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("hides Carregar mais when there is no next page", () => {
    mockHistory({ hasNextPage: false });
    renderTab();

    expect(screen.queryByRole("button", { name: "Carregar mais" })).not.toBeInTheDocument();
  });

  it("disables the button while the next page loads", () => {
    mockHistory({ hasNextPage: true, isFetchingNextPage: true });
    renderTab();

    expect(screen.getByRole("button", { name: "Carregando…" })).toBeDisabled();
  });

  it("keeps the loaded rows, shows the error and allows a retry when Carregar mais fails", () => {
    const fetchNextPage = vi.fn();
    // A failed next page keeps the loaded pages and the cursor (React Query).
    mockHistory({
      data: {
        ...historyData(),
        transactions: [
          {
            id: "tx-1",
            userId: "user-1",
            workspaceId: "ws-1",
            campaignId: null,
            campaignName: null,
            derivationId: null,
            amount: -2,
            type: "usage",
            description: "Linha já carregada",
            createdAt: "2026-10-01T12:00:00.000Z",
          },
        ],
      },
      isError: true,
      hasNextPage: true,
      isFetchNextPageError: true,
      fetchNextPage,
    });
    renderTab();

    expect(screen.getByText("Linha já carregada")).toBeInTheDocument();
    expect(screen.getByText("Erro")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Carregar mais" });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("passes new params to the hook when a filter changes", async () => {
    renderTab();
    const first = mockUseCreditHistory.mock.calls.at(-1)![0] as { from?: string; to?: string };
    expect(first.from).toBeDefined();

    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByRole("option", { name: "Todo o período" }));

    await waitFor(() => {
      const last = mockUseCreditHistory.mock.calls.at(-1)![0] as { from?: string; to?: string };
      expect(last.from).toBeUndefined();
      expect(last.to).toBeUndefined();
    });
  });

  it("takes the totals from summary and draws the chart from usageSeries even without loaded rows", () => {
    mockHistory({
      data: {
        ...historyData(),
        summary: { totalSpent: 321, remainingCredits: 80, averagePerCampaign: 17, transactionCount: 500 },
        usageSeries: [{ date: "2026-10-01", amount: 12 }],
        transactions: [],
      },
    });
    renderTab();

    expect(screen.getByText("321")).toBeVisible();
    expect(screen.getByText("17")).toBeVisible();
    expect(screen.getByText("Uso ao longo do tempo")).toBeVisible();
  });

  it("does not draw the chart when usageSeries is empty", () => {
    renderTab();

    expect(screen.queryByText("Uso ao longo do tempo")).not.toBeInTheDocument();
  });
});
