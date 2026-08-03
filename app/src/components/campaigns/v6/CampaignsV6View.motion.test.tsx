import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CampaignsV6View from "./CampaignsV6View";
import type { CampaignsV6Labels, CampaignV6Row } from "./campaigns-v6-types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const labels: CampaignsV6Labels = {
  sectionLabel: "Trabalhos",
  versionBadge: "V6",
  formatTitle: (count) => `${count} trabalhos`,
  subtitle: "Supervisão",
  sortPrefix: "Ordenar",
  newCampaign: "Nova campanha",
  searchPlaceholder: "Buscar",
  searchAriaLabel: "Buscar",
  filtersAria: "Filtros",
  statusChipPrefix: "Status",
  platformChipPrefix: "Plataformas",
  originAll: "Todos",
  originCampaigns: "Campanhas",
  originPosts: "Posts",
  viewList: "Lista",
  viewGrid: "Grade",
  viewBoard: "Quadro",
  selectCampaign: (name) => `Selecionar ${name}`,
  actionsFor: (name) => `Ações para ${name}`,
  openCampaign: "Abrir",
  duplicate: "Duplicar",
  saveAsTemplate: "Salvar modelo",
  archive: "Arquivar",
  delete: "Excluir",
  variationsLabel: "variações",
  approvedLabel: "aprovadas",
};

const row: CampaignV6Row = {
  id: "campaign-1",
  href: "/campaigns/campaign-1",
  initials: "AC",
  name: "Aquisição",
  variations: 3,
  approved: 1,
  status: "Ativa",
  statusVariant: "success",
  updated: "agora",
  originKind: "campaign",
  originLabel: "Campanha",
};

function view(
  selectedIds = new Set<string>(),
  onToggleSelect = vi.fn(),
  rows: CampaignV6Row[] = [row],
) {
  return (
    <CampaignsV6View
      labels={labels}
      rows={rows}
      totalCount={1}
      searchQuery=""
      showCampaignFilters={false}
      statusFilter="all"
      statusFilterLabel="Todos"
      statusOptions={[]}
      platformFilter="all"
      platformFilterLabel="Todas"
      platformOptions={[]}
      sortOption="updated"
      sortLabel="Recentes"
      sortOptions={[]}
      viewMode="list"
      selectedIds={selectedIds}
      onToggleSelect={onToggleSelect}
    />
  );
}

function renderView(selectedIds = new Set<string>(), onToggleSelect = vi.fn()) {
  return render(view(selectedIds, onToggleSelect));
}

describe("CampaignsV6View motion selection contract", () => {
  it("renders failed status as danger and generating status as warning", () => {
    render(
      view(new Set(), vi.fn(), [
        { ...row, id: "failed", name: "Failed", status: "Failed", statusVariant: "danger" },
        { ...row, id: "generating", name: "Generating", status: "Generating", statusVariant: "warning" },
      ]),
    );

    expect(screen.getByText("Failed", { selector: "span" })).toHaveClass("bg-[var(--danger-bg)]");
    expect(screen.getByText("Generating", { selector: "span" })).toHaveClass("bg-[var(--warning-bg)]");
  });

  it("keeps checkbox semantics and exposes the selected visual state", () => {
    const onToggleSelect = vi.fn();
    const { rerender } = renderView(new Set(), onToggleSelect);
    const checkbox = screen.getByRole("checkbox", { name: "Selecionar Aquisição" });

    fireEvent.click(checkbox);
    expect(onToggleSelect).toHaveBeenCalledWith("campaign-1", true);
    expect(checkbox.closest("li")).not.toHaveAttribute("role");
    expect(screen.getByRole("link", { name: "Aquisição" })).toHaveAttribute("href", "/campaigns/campaign-1");

    rerender(view(new Set(["campaign-1"]), onToggleSelect));

    expect(checkbox).toBeChecked();
    expect(checkbox.closest("li")).toHaveAttribute("data-motion-highlight", "selected");
    expect(checkbox.closest("li")).toHaveAttribute("data-selection-marker", "selected");
    expect(checkbox).toHaveClass("accent-[var(--selection-text)]");
  });
});
