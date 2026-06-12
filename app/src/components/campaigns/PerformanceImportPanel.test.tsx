import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PerformanceImportPanel from "./PerformanceImportPanel";

vi.mock("@/lib/hooks/use-performance-import", () => ({
  usePerformanceImportBatches: vi.fn(() => ({ data: [], isLoading: false })),
  usePreviewManualImport: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  usePreviewCsvImport: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useConfirmPerformanceImport: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  defaultParseOptions: {
    defaultCurrency: "BRL",
    locale: "pt-BR",
    decimalSeparator: ",",
    percentFormat: "percent",
    sourceTimezone: "America/Sao_Paulo",
  },
  extractCsvHeaders: vi.fn(),
  buildAutoColumnMapping: vi.fn(() => ({})),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("PerformanceImportPanel", () => {
  it("renders manual, csv and history tabs", () => {
    render(
      <PerformanceImportPanel
        campaignId="camp-1"
        derivations={[{ id: "deriv-1", label: "Feed #1" }]}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByRole("button", { name: "Manual" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Histórico" })).toBeInTheDocument();
    expect(screen.getByText("Derivação")).toBeInTheDocument();
  });
});
