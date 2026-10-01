import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../../messages/pt-BR.json";

let pathname = "/";
let search = "";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ push: vi.fn() }),
}));
let staffAllowed: boolean | undefined;
let ownerAllowed: boolean | undefined;
vi.mock("@/lib/hooks/use-equipe-staff", () => ({ useEquipeStaffAccess: () => ({ data: staffAllowed === undefined ? undefined : { allowed: staffAllowed } }) }));
vi.mock("@/lib/hooks/use-platform-owner", () => ({ usePlatformOwnerAccess: () => ({ data: ownerAllowed === undefined ? undefined : { allowed: ownerAllowed } }) }));
vi.mock("@/lib/equipe/use-equipe", () => ({ useEquipeEnabled: () => true }));
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: vi.fn() } }));

import RailMobileNav from "./RailMobileNav";

const renderNav = () =>
  render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><RailMobileNav /></NextIntlClientProvider>);

describe("RailMobileNav", () => {
  beforeEach(() => {
    pathname = "/";
    search = "";
    staffAllowed = undefined;
    ownerAllowed = undefined;
  });

  it("is the bottom bar: Conversa, Criações, Biblioteca and Mais", () => {
    renderNav();
    const bar = screen.getByRole("navigation", { name: "Primary mobile navigation" });
    expect(within(bar).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Conversa", "/"],
      ["Criações", "/campaigns"],
      ["Biblioteca", "/library"],
    ]);
    expect(within(bar).getByRole("button", { name: "Mais" })).toBeInTheDocument();
  });

  it("marks the current tab", () => {
    pathname = "/campaigns/1";
    renderNav();
    expect(screen.getByRole("link", { name: "Criações" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Conversa" })).not.toHaveAttribute("aria-current");
  });

  it("lights Mais up for what the bar does not list: Ideias, Metas and unlisted routes", () => {
    for (const route of ["/ideas", "/goals", "/settings", "/pipeline"]) {
      pathname = route;
      const { unmount } = renderNav();
      const more = screen.getByRole("button", { name: "Mais" });
      expect(more.className, route).toContain("active-navigation-bg");
      unmount();
    }
    pathname = "/library";
    renderNav();
    expect(screen.getByRole("button", { name: "Mais" }).className).not.toContain("active-navigation-bg");
  });

  it("opens the sheet with Ideias and Metas but without Pipeline, which lives in the header", () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("link", { name: "Ideias" })).toHaveAttribute("href", "/ideas");
    expect(within(dialog).getByRole("link", { name: "Metas" })).toHaveAttribute("href", "/goals");
    expect(within(dialog).queryByRole("link", { name: "Pipeline" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: ptBR.navigation.config })).toHaveAttribute("href", "/settings");
    expect(within(dialog).getByRole("link", { name: ptBR.navigation.docs })).toHaveAttribute("href", "/docs");
  });

  it("names the close button of the Mais sheet in Portuguese", () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Fechar" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("carries the chosen account into Ideias and Metas in the sheet", () => {
    search = "account=acc-3";
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    expect(screen.getByRole("link", { name: "Ideias" })).toHaveAttribute("href", "/ideas?account=acc-3");
  });

  it("adds the internal consoles only for staff and the feedback console only for the platform owner", () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    expect(screen.queryByRole("link", { name: ptBR.navigation.feedback })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: ptBR.navigation.equipeAccounts })).not.toBeInTheDocument();
  });

  it("shows the extra items when the person has access", () => {
    staffAllowed = true;
    ownerAllowed = true;
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    expect(screen.getByRole("link", { name: ptBR.navigation.feedback })).toHaveAttribute("href", "/feedback");
    for (const [key, href] of [
      ["equipeExceptions", "/admin/equipe/exceptions"],
      ["equipeAccounts", "/admin/equipe/accounts"],
      ["equipeQuality", "/admin/equipe/quality"],
    ] as const) {
      expect(screen.getByRole("link", { name: ptBR.navigation[key] })).toHaveAttribute("href", href);
    }
  });

  it("does not show the staff consoles when access is explicitly denied", () => {
    staffAllowed = false;
    ownerAllowed = false;
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    expect(screen.queryByRole("link", { name: ptBR.navigation.equipeQuality })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: ptBR.navigation.feedback })).not.toBeInTheDocument();
  });
});
