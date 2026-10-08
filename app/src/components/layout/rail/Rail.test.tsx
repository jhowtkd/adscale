import { useRef } from "react";
import { existsSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../../messages/pt-BR.json";

let pathname = "/";
let search = "";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ push }),
}));

vi.mock("./AccountMenu", () => ({ default: () => <button type="button">conta</button> }));
vi.mock("./BrandSwitcher", () => ({ default: () => <button type="button" data-testid="rail-brand-switcher">CA</button> }));

import Rail from "./Rail";
import { RAIL_DESTINATIONS } from "./rail-nav";
import { RailSearchProvider, useRailSearchTarget } from "./rail-search";

function renderRail(extra?: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <RailSearchProvider>
        <Rail />
        {extra}
      </RailSearchProvider>
    </NextIntlClientProvider>,
  );
}

function PageWithSearch() {
  const ref = useRef<HTMLInputElement>(null);
  useRailSearchTarget(ref);
  return <input ref={ref} aria-label="Filtrar" />;
}

describe("Rail", () => {
  beforeEach(() => {
    pathname = "/";
    search = "";
    push.mockClear();
  });

  it("offers the v4 destinations, in order, on routes that already exist", () => {
    renderRail();
    const nav = screen.getByRole("navigation", { name: "Seções" });
    const entries = within(nav).getAllByRole("listitem").map((item) => {
      const link = within(item).queryByRole("link");
      return { name: (link ?? within(item).getByRole("button")).getAttribute("aria-label"), href: link?.getAttribute("href") ?? null };
    });
    expect(entries).toEqual([
      { name: "Conversa", href: "/" },
      { name: "Buscar", href: null },
      { name: "Criações", href: "/campaigns" },
      { name: "Biblioteca", href: "/library" },
      { name: "Ideias", href: "/ideas" },
      { name: "Metas", href: "/goals" },
    ]);
  });

  it("creates no new route: every destination is a page that exists in the app", () => {
    for (const { href } of RAIL_DESTINATIONS) {
      const dir = href === "/" ? "src/app/(dashboard)" : `src/app/(dashboard)${href}`;
      expect(existsSync(`${dir}/page.tsx`), href).toBe(true);
    }
  });

  it("marks only the current destination with aria-current", () => {
    pathname = "/library";
    renderRail();
    expect(screen.getByRole("link", { name: "Biblioteca" })).toHaveAttribute("aria-current", "page");
    for (const name of ["Conversa", "Criações", "Ideias", "Metas"]) {
      expect(screen.getByRole("link", { name })).not.toHaveAttribute("aria-current");
    }
  });

  it("keeps Conversa current on a conversation thread and Criações on the creation tools", () => {
    pathname = "/assistant";
    const { unmount } = renderRail();
    expect(screen.getByRole("link", { name: "Conversa" })).toHaveAttribute("aria-current", "page");
    unmount();
    pathname = "/quick-tools/create-post";
    renderRail();
    expect(screen.getByRole("link", { name: "Criações" })).toHaveAttribute("aria-current", "page");
  });

  it("marks nothing current on a route the rail does not list, such as /pipeline", () => {
    pathname = "/pipeline";
    renderRail();
    const nav = screen.getByRole("navigation", { name: "Seções" });
    expect(nav.querySelector("[aria-current]")).toBeNull();
  });

  it("carries the chosen account to Ideias and Metas only", () => {
    search = "account=acc-7";
    renderRail();
    expect(screen.getByRole("link", { name: "Ideias" })).toHaveAttribute("href", "/ideas?account=acc-7");
    expect(screen.getByRole("link", { name: "Metas" })).toHaveAttribute("href", "/goals?account=acc-7");
    expect(screen.getByRole("link", { name: "Conversa" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Criações" })).toHaveAttribute("href", "/campaigns");
    expect(screen.getByRole("link", { name: "Biblioteca" })).toHaveAttribute("href", "/library");
  });

  it("puts the active brand under the mark, where the new-conversation button was (frame c8)", () => {
    renderRail();
    expect(screen.getByTestId("rail-brand-switcher")).toBeInTheDocument();
    expect(screen.queryByTestId("rail-new-conversation")).not.toBeInTheDocument();
  });

  it("focuses the search field of the page the person is on when pressing Buscar", () => {
    pathname = "/library";
    renderRail(<PageWithSearch />);
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(screen.getByLabelText("Filtrar")).toHaveFocus();
    expect(push).not.toHaveBeenCalled();
  });

  it("leads to the conversation when the page has no search field", () => {
    pathname = "/ideas";
    renderRail();
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(push).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("links help and the logo, and shows the account menu", () => {
    renderRail();
    expect(screen.getByRole("link", { name: "Ajuda" })).toHaveAttribute("href", "/docs");
    expect(screen.getByRole("link", { name: "ADScale" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "conta" })).toBeInTheDocument();
  });

  it("never shows the word Equipe", () => {
    renderRail();
    expect(screen.getByTestId("rail").textContent).not.toMatch(/\bEquipe\b/);
    for (const el of screen.getByTestId("rail").querySelectorAll("[aria-label],[title]")) {
      expect(`${el.getAttribute("aria-label")} ${el.getAttribute("title")}`).not.toMatch(/\bEquipe\b/);
    }
  });
});
