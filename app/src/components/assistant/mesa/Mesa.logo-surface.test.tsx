// The plate the logo card is painted on (ticket 16): the dark one for a logo with light ink, the cream one it always had otherwise.
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import ptBR from "../../../../messages/pt-BR.json";
import type { MesaCard } from "@/lib/equipe/mesa";

vi.mock("@/lib/hooks/use-media-query", () => ({ useIsMobile: () => false }));
import Mesa from "./Mesa";

const photo: MesaCard = { kind: "photo", id: "p1", src: "/p1.jpg", origin: "site" };
const palette: MesaCard = { kind: "palette", id: "palette", colors: ["#111111", "#222222"] };
const renderMesa = (cards: MesaCard[]) => render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><Mesa cards={cards} size="compact" /></NextIntlClientProvider>);
/** The plate is the logo's own wrapper: the parent of the image. */
const plate = () => screen.getByRole("img", { name: "Logo da marca" }).parentElement as HTMLElement;

describe("Mesa: the logo card's plate", () => {
  it("a dark surface paints the graphite plate and says so", () => {
    renderMesa([photo, { kind: "logo", id: "l", src: "/logo.png", surface: "dark" }]);
    expect(plate()).toHaveAttribute("data-surface", "dark");
    expect(plate().style.background).toContain("linear-gradient");
    expect(plate().style.background.toLowerCase()).toMatch(/#17191d|rgb\(23, 25, 29\)/);
    expect(plate().style.background.toLowerCase()).toMatch(/#101115|rgb\(16, 17, 21\)/);
    expect(plate().style.background.toLowerCase()).not.toMatch(/#f6f1e8|rgb\(246, 241, 232\)/);
  });
  it.each([["light", { surface: "light" as const }], ["no surface", {}]])("%s paints the cream plate it always had and says light", (_name, extra) => {
    renderMesa([photo, { kind: "logo", id: "l", src: "/logo.png", ...extra }]);
    expect(plate()).toHaveAttribute("data-surface", "light");
    expect(plate().style.background.toLowerCase()).toMatch(/#f6f1e8|rgb\(246, 241, 232\)/);
    expect(plate().style.background.toLowerCase()).toMatch(/#e9e1d4|rgb\(233, 225, 212\)/);
    expect(plate().style.background.toLowerCase()).not.toMatch(/#17191d|rgb\(23, 25, 29\)/);
  });
  it("the logo is still the same image, with the same alt and source, on either plate", () => {
    for (const surface of ["dark", "light"] as const) {
      const { unmount } = renderMesa([photo, { kind: "logo", id: "l", src: "/logo.png", surface }]);
      const image = screen.getByRole("img", { name: "Logo da marca" });
      expect(image).toHaveAttribute("src", "/logo.png");
      expect(screen.getByTestId("mesa-card-logo")).toBeInTheDocument();
      unmount();
    }
  });
  it("the palette card does not change with the logo's surface", () => {
    renderMesa([{ kind: "logo", id: "l", src: "/logo.png", surface: "dark" }, palette]);
    const card = screen.getByTestId("mesa-card-palette");
    expect(card).toHaveTextContent("Paleta · 2 cores");
    expect(card.querySelector("[data-surface]")).toBeNull();
  });
});
