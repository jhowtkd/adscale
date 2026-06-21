import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CampaignsFilterToolbar from "./CampaignsFilterToolbar";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const campaign: Record<string, string> = {
      searchPlaceholder: "Buscar campanhas...",
      viewModeLabel: "Modo de visualização",
      viewList: "Lista",
      viewGrid: "Grade",
      viewBoard: "Quadro",
      "status.draft": "Rascunho",
      "platformNames.Meta": "Meta Ads",
    };
    const common: Record<string, string> = {
      status: "Status",
      platforms: "Plataformas",
      sort: "Ordenar",
      allStatus: "Todos os status",
      allPlatforms: "Todas as plataformas",
      newest: "Mais recente",
      oldest: "Mais antigo",
      nameAsc: "Nome A-Z",
      nameDesc: "Nome Z-A",
      mostDerivations: "Mais variações",
      filters: "Filtros",
      clear: "Limpar",
      clearAll: "Limpar tudo",
      clearSearch: "Limpar busca",
    };
    const dict = namespace === "campaign" ? campaign : common;
    return dict[key] ?? key;
  },
}));

describe("CampaignsFilterToolbar", () => {
  const baseProps = {
    searchQuery: "",
    onSearchChange: vi.fn(),
    statusFilter: "all" as const,
    onStatusChange: vi.fn(),
    platformFilter: "all" as const,
    onPlatformChange: vi.fn(),
    sortOption: "newest" as const,
    onSortChange: vi.fn(),
    viewMode: "list" as const,
    onViewModeChange: vi.fn(),
    activeFilters: [],
    hasActiveFilters: false,
    onClearFilters: vi.fn(),
  };

  it("shows labeled filters with human-readable values instead of raw keys", () => {
    render(<CampaignsFilterToolbar {...baseProps} />);

    expect(screen.getByPlaceholderText("Buscar campanhas...")).toBeInTheDocument();
    expect(screen.getByText("Todos os status")).toBeInTheDocument();
    expect(screen.getByText("Todas as plataformas")).toBeInTheDocument();
    expect(screen.getByText("Mais recente")).toBeInTheDocument();
    expect(screen.getByLabelText("Modo de visualização")).toBeInTheDocument();
  });

  it("renders active filter pills when filters are applied", () => {
    render(
      <CampaignsFilterToolbar
        {...baseProps}
        hasActiveFilters
        activeFilters={[
          { label: 'Status: "Rascunho"', onRemove: vi.fn() },
        ]}
      />,
    );

    expect(screen.getByText('Status: "Rascunho"')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Limpar tudo" })).toBeInTheDocument();
  });
});
