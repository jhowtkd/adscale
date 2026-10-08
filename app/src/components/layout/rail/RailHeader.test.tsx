import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../../messages/pt-BR.json";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/components/layout/TopBar", () => ({ NotificationMenu: () => <button type="button">sino</button> }));
vi.mock("./BrandSwitcher", () => ({ default: () => <button type="button" data-testid="rail-brand-switcher">CA</button> }));
let accounts: Array<{ id: string; clientProfileId: string; pendingDecisions?: boolean }> = [];
let railBrand: { id: string; name: string } | undefined;
vi.mock("@/lib/brands/active-brand-context", () => ({ useActiveBrand: () => railBrand }));
vi.mock("@/lib/equipe/use-equipe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/equipe/use-equipe")>()),
  useEquipeAccounts: () => ({ data: { accounts } }),
}));

import RailHeader from "./RailHeader";

const renderHeader = () =>
  render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><RailHeader /></NextIntlClientProvider>);

describe("RailHeader", () => {
  beforeEach(() => {
    pathname = "/";
    railBrand = undefined;
    accounts = [{ id: "acc-1", clientProfileId: "p1" }];
  });

  it("shows Painel | Pipeline and the bell", () => {
    renderHeader();
    expect(screen.getByRole("link", { name: "Painel" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Pipeline" })).toHaveAttribute("href", "/pipeline?account=acc-1");
    expect(screen.getByRole("button", { name: "sino" })).toBeInTheDocument();
  });

  it("offers the brand switcher on the phone only, where the rail is not shown", () => {
    renderHeader();
    expect(screen.getByTestId("rail-brand-switcher").parentElement).toHaveClass("md:hidden");
  });

  it.each(["/", "/library", "/ideas", "/assistant"])("has Painel current on %s", (route) => {
    pathname = route;
    renderHeader();
    expect(screen.getByRole("link", { name: "Painel" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Pipeline" })).not.toHaveAttribute("aria-current");
  });

  it("has Pipeline current on /pipeline", () => {
    pathname = "/pipeline";
    renderHeader();
    expect(screen.getByRole("link", { name: "Pipeline" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Painel" })).not.toHaveAttribute("aria-current");
  });

  it("links Pipeline to the active brand's account, not to the one with decisions pending (spec 2026-10-07 §3)", () => {
    accounts = [{ id: "acc-1", clientProfileId: "p1" }, { id: "acc-2", clientProfileId: "p2", pendingDecisions: true }];
    railBrand = { id: "p1", name: "Brand 1" };
    renderHeader();
    expect(screen.getByRole("link", { name: "Pipeline" })).toHaveAttribute("href", "/pipeline?account=acc-1");
  });

  it("links Pipeline without an account while the active brand has none", () => {
    railBrand = { id: "p-new", name: "Nova" };
    renderHeader();
    expect(screen.getByRole("link", { name: "Pipeline" })).toHaveAttribute("href", "/pipeline");
  });

  it("links Pipeline without an account while none is loaded", () => {
    accounts = [];
    renderHeader();
    expect(screen.getByRole("link", { name: "Pipeline" })).toHaveAttribute("href", "/pipeline");
  });
});
