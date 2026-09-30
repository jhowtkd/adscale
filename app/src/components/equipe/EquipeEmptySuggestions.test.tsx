import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import EquipeEmptySuggestions from "./EquipeEmptySuggestions";
import { EMPTY_SCREEN_SUGGESTIONS } from "@/lib/equipe/suggestions";

// Ticket 02: empty screens (Biblioteca, Criações, Ideias, Metas) use a fixed
// per-surface list; the click lands on "/" with the frase already applied as
// ?suggestion=. Wiring that query param into the home page is ticket 09.
describe("EquipeEmptySuggestions", () => {
  it.each(Object.keys(EMPTY_SCREEN_SUGGESTIONS) as Array<keyof typeof EMPTY_SCREEN_SUGGESTIONS>)(
    "renders the fixed list for %s, each linking to / with ?suggestion=<frase>",
    (surface) => {
      render(<EquipeEmptySuggestions surface={surface} />);

      const list = screen.getByTestId("equipe-empty-suggestions");
      const links = within(list).getAllByRole("link");
      const expected = EMPTY_SCREEN_SUGGESTIONS[surface];
      expect(links).toHaveLength(expected.length);
      links.forEach((link, index) => {
        const text = expected[index]!;
        expect(link).toHaveTextContent(text);
        expect(link).toHaveAttribute("href", `/?suggestion=${new URLSearchParams({ suggestion: text })
          .toString()
          .replace("suggestion=", "")}`);
      });
    },
  );
});
