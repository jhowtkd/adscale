import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../messages/pt-BR.json";
import { EMPTY_SCREEN_SUGGESTIONS, isCatalogSuggestion } from "@/lib/equipe/suggestions";

let accounts: Array<{ id: string; clientProfileName?: string | null; pendingDecisions?: boolean }> | undefined;
let activeBrand: { id: string; name: string } | undefined;
vi.mock("@/lib/brands/active-brand-context", () => ({ useActiveBrand: () => activeBrand }));
vi.mock("@/lib/equipe/use-equipe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/equipe/use-equipe")>()),
  useEquipeAccounts: () => ({ data: accounts ? { accounts } : undefined }),
}));

import EquipeEmptyScreen from "./EquipeEmptyScreen";

const surfaces = Object.keys(EMPTY_SCREEN_SUGGESTIONS) as Array<keyof typeof EMPTY_SCREEN_SUGGESTIONS>;
const renderScreen = (surface: keyof typeof EMPTY_SCREEN_SUGGESTIONS) =>
  render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><EquipeEmptyScreen surface={surface} /></NextIntlClientProvider>);

describe("EquipeEmptyScreen", () => {
  beforeEach(() => {
    activeBrand = undefined;
    accounts = [{ id: "acc-1", clientProfileName: "Café do Zé" }];
  });

  it.each(surfaces)("labels the %s screen with its own title and says what will appear, for the brand", (surface) => {
    renderScreen(surface);
    const section = screen.getByTestId("equipe-empty-screen");
    expect(section).toHaveAttribute("data-surface", surface);
    const copy = ptBR.equipe.emptyScreens[surface];
    expect(screen.getByRole("heading", { level: 2, name: copy.title })).toBeInTheDocument();
    expect(section).toHaveTextContent(copy.description.replace("{brand}", "Café do Zé"));
    expect(section).toHaveAccessibleName(copy.title);
  });

  it.each(surfaces)("lists exactly the fixed suggestions of the %s screen, each leading to /?suggestion=", (surface) => {
    renderScreen(surface);
    const links = within(screen.getByTestId("equipe-empty-suggestions")).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([...EMPTY_SCREEN_SUGGESTIONS[surface]]);
    for (const link of links) {
      const href = link.getAttribute("href")!;
      expect(href.startsWith("/?suggestion=")).toBe(true);
      // The conversation accepts only catalog phrases, so every link of the screen must round-trip into one.
      const phrase = new URLSearchParams(href.slice(2)).get("suggestion");
      expect(isCatalogSuggestion(phrase)).toBe(true);
      expect(phrase).toBe(link.textContent);
    }
  });

  it("offers no suggestion from another screen", () => {
    renderScreen("library");
    const others = surfaces.filter((s) => s !== "library").flatMap((s) => EMPTY_SCREEN_SUGGESTIONS[s]);
    const own = new Set<string>(EMPTY_SCREEN_SUGGESTIONS.library);
    for (const phrase of others) if (!own.has(phrase)) expect(screen.queryByRole("link", { name: phrase })).not.toBeInTheDocument();
  });

  it("falls back to 'sua marca' while no account is loaded or the account has no name", () => {
    accounts = undefined;
    const { unmount } = renderScreen("library");
    expect(screen.getByTestId("equipe-empty-screen")).toHaveTextContent("de sua marca aparece aqui");
    unmount();
    accounts = [{ id: "acc-1", clientProfileName: "   " }];
    renderScreen("library");
    expect(screen.getByTestId("equipe-empty-screen")).toHaveTextContent("de sua marca aparece aqui");
  });

  it("uses the default account's brand: the one with pending decisions first", () => {
    accounts = [{ id: "a", clientProfileName: "Primeira" }, { id: "b", clientProfileName: "Com pendência", pendingDecisions: true }];
    renderScreen("creations");
    expect(screen.getByTestId("equipe-empty-screen")).toHaveTextContent("para Com pendência");
  });

  it("names the rail's active brand, even before it has an account (spec 2026-10-07 §3)", () => {
    activeBrand = { id: "b-new", name: "Studio Lume" };
    renderScreen("library");
    expect(screen.getByText(/Studio Lume/)).toBeInTheDocument();
  });

  it("never says Equipe", () => {
    for (const surface of surfaces) {
      const { unmount } = renderScreen(surface);
      expect(screen.getByTestId("equipe-empty-screen").textContent).not.toMatch(/\bEquipe\b/);
      unmount();
    }
  });
});
