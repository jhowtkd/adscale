import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../../messages/pt-BR.json";

const switchBrand = vi.fn();
let brand: { id: string; name: string } | null | undefined;
vi.mock("@/lib/brands/active-brand-context", () => ({
  useActiveBrand: () => brand,
  useSwitchActiveBrand: () => switchBrand,
}));
let freePlan: { accountId: string | null } | null | undefined;
vi.mock("@/lib/equipe/use-equipe", () => ({ useFreePlanAccount: () => freePlan }));
const allBrands = [{ id: "b-cafe", name: "Café Aurora" }, { id: "b-livraria", name: "Livraria Norte" }, { id: "b-studio", name: "Studio Lume" }];
let profiles: Array<{ id: string; name: string; createdAt?: Date }> | undefined;
vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useClientProfiles: () => ({ data: profiles }),
}));
vi.mock("@/components/assistant/AssistantCreateClientDialog", () => ({
  default: ({ open, onSuccess }: { open: boolean; onSuccess?: (id: string) => void }) =>
    open ? <button type="button" onClick={() => onSuccess?.("b-nova")}>criar marca</button> : null,
}));
vi.mock("@/components/billing/FreePlanCta", () => ({
  FreePlanCta: ({ intro }: { intro?: string }) => <div data-testid="free-plan-cta">{intro}</div>,
}));

import BrandSwitcher, { brandMonogram } from "./BrandSwitcher";

const renderSwitcher = () => render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><BrandSwitcher /></NextIntlClientProvider>);

describe("BrandSwitcher (spec 2026-10-07 §3, frames c8 and c8b)", () => {
  beforeEach(() => {
    switchBrand.mockClear();
    brand = { id: "b-cafe", name: "Café Aurora" };
    freePlan = null;
    profiles = allBrands;
  });

  it("shows the active brand's monogram", () => {
    renderSwitcher();
    expect(screen.getByTestId("rail-brand-switcher")).toHaveTextContent("CA");
    expect(screen.getByRole("button", { name: "Marca ativa: Café Aurora. Trocar marca" })).toBeInTheDocument();
  });

  it("lists the brands, marks the active one and switches to another", () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("rail-brand-switcher"));
    expect(screen.getAllByTestId("rail-brand-option").map((item) => item.textContent)).toEqual([
      expect.stringContaining("Café Aurora"), expect.stringContaining("Livraria Norte"), expect.stringContaining("Studio Lume"),
    ]);
    fireEvent.click(screen.getByRole("menuitem", { name: /Livraria Norte/ }));
    expect(switchBrand).toHaveBeenCalledWith("b-livraria");
  });

  it("lists the brands oldest first, as in c8, whatever order the list comes in (newest edited first)", () => {
    brand = { id: "b-livraria", name: "Livraria Norte" };
    profiles = [
      { id: "b-studio", name: "Studio Lume", createdAt: new Date("2026-10-03T10:00:00Z") },
      { id: "b-cafe", name: "Café Aurora", createdAt: new Date("2026-10-01T10:00:00Z") },
      { id: "b-livraria", name: "Livraria Norte", createdAt: new Date("2026-10-02T10:00:00Z") },
    ];
    renderSwitcher();
    fireEvent.click(screen.getByTestId("rail-brand-switcher"));
    expect(screen.getAllByTestId("rail-brand-option").map((item) => item.textContent)).toEqual([
      expect.stringContaining("Café Aurora"), expect.stringContaining("Livraria Norte"), expect.stringContaining("Studio Lume"),
    ]);
  });

  it("leads to the active brand's Brand Kit, a real link, on every plan (the rail lists no Brand Kit of its own)", () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("rail-brand-switcher"));
    expect(screen.getByRole("menuitem", { name: "Brand Kit da marca" })).toHaveAttribute("href", "/brand-kit");
    cleanup();
    freePlan = { accountId: "acc-1" };
    renderSwitcher();
    fireEvent.click(screen.getByTestId("rail-brand-switcher"));
    expect(screen.getByRole("menuitem", { name: "Brand Kit da marca" })).toHaveAttribute("href", "/brand-kit");
  });

  it("adds a brand for a paying workspace and switches to it", () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("rail-brand-switcher"));
    fireEvent.click(screen.getByTestId("rail-add-brand"));
    fireEvent.click(screen.getByRole("button", { name: "criar marca" }));
    expect(switchBrand).toHaveBeenCalledWith("b-nova");
  });

  it("locks adding a brand on the free plan and leads to the plan card", () => {
    freePlan = { accountId: "acc-1" };
    renderSwitcher();
    fireEvent.click(screen.getByTestId("rail-brand-switcher"));
    expect(screen.queryByTestId("rail-add-brand")).not.toBeInTheDocument();
    expect(screen.getByTestId("rail-add-brand-locked")).toHaveTextContent("Outras marcas fazem parte do plano.");
    fireEvent.click(screen.getByRole("button", { name: "Ver card do plano" }));
    expect(screen.getByTestId("free-plan-cta")).toHaveTextContent("Outras marcas fazem parte do plano.");
  });

  it("lists only the active brand on the free plan, where no other brand could become active (frame c8b)", () => {
    freePlan = { accountId: "acc-1" };
    renderSwitcher();
    fireEvent.click(screen.getByTestId("rail-brand-switcher"));
    expect(screen.getAllByTestId("rail-brand-option").map((item) => item.textContent)).toEqual([expect.stringContaining("Café Aurora")]);
    expect(screen.getByTestId("rail-add-brand-locked")).toBeInTheDocument();
  });

  it("lists every brand for a paying workspace and while the plan is unknown", () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("rail-brand-switcher"));
    expect(screen.getAllByTestId("rail-brand-option")).toHaveLength(3);
    cleanup();
    freePlan = undefined;
    renderSwitcher();
    fireEvent.click(screen.getByTestId("rail-brand-switcher"));
    expect(screen.getAllByTestId("rail-brand-option")).toHaveLength(3);
  });

  it("closes the menu when the plan card opens, so the card is not shown over an open menu", async () => {
    freePlan = { accountId: "acc-1" };
    renderSwitcher();
    fireEvent.click(screen.getByTestId("rail-brand-switcher"));
    fireEvent.click(screen.getByRole("button", { name: "Ver card do plano" }));
    expect(screen.getByTestId("free-plan-cta")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("rail-add-brand-locked")).not.toBeInTheDocument());
  });

  it("keeps the active brand in the menu while the list of brands is still loading", () => {
    profiles = undefined;
    renderSwitcher();
    fireEvent.click(screen.getByTestId("rail-brand-switcher"));
    expect(screen.getAllByTestId("rail-brand-option").map((item) => item.textContent)).toEqual([expect.stringContaining("Café Aurora")]);
  });

  it("offers no add while the plan is unknown, and renders nothing without a brand", () => {
    freePlan = undefined;
    const { unmount } = renderSwitcher();
    fireEvent.click(screen.getByTestId("rail-brand-switcher"));
    expect(screen.queryByTestId("rail-add-brand")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rail-add-brand-locked")).not.toBeInTheDocument();
    unmount();
    brand = null;
    renderSwitcher();
    expect(screen.queryByTestId("rail-brand-switcher")).not.toBeInTheDocument();
  });

  it("makes a monogram of two letters", () => {
    expect(brandMonogram("Café Aurora")).toBe("CA");
    expect(brandMonogram("CENBRAP")).toBe("CE");
    expect(brandMonogram("  ")).toBe("?");
  });
});
