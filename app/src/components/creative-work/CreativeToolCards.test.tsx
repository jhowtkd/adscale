import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreativeToolCards } from "./CreativeToolCards";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => ({
  variations: "Variações", single: "Peça única", format_adaptation: "Adaptar formatos", restyle: "Mudar estilo",
  variationsDescription: "desc", singleDescription: "desc", format_adaptationDescription: "desc", restyleDescription: "desc",
  variationsHelpLabel: "Ajuda sobre Variações", singleHelpLabel: "Ajuda sobre Peça única", format_adaptationHelpLabel: "Ajuda sobre Adaptar formatos", restyleHelpLabel: "Ajuda sobre Mudar estilo",
  variationsHelp: "Compara abordagens", singleHelp: "Uma direção clara", format_adaptationHelp: "Outros canais", restyleHelp: "Muda o visual",
}[key] ?? key) }));

describe("CreativeToolCards", () => {
  it("selects a preset in the same composer without navigation and explains protocols", async () => {
    const onSelect = vi.fn();
    render(<CreativeToolCards selected="variations" onSelect={onSelect} />);

    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
    expect(screen.getByRole("button", { pressed: true })).toHaveClass(
      "border-[var(--selection-border)]",
      "bg-[var(--selection-bg)]",
      "focus-visible:ring-[var(--focus-ring)]",
    );
    expect(screen.getAllByRole("button", { name: /Ajuda sobre/i })).toHaveLength(4);
    const card = screen.getByRole("button", { pressed: true });
    const help = screen.getByRole("button", { name: "Ajuda sobre Variações" });
    expect(card).not.toContainElement(help);
    expect(help).not.toContainElement(card);
    fireEvent.focus(help);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Compara abordagens");
    fireEvent.click(screen.getByRole("button", { name: /^peça única/i }));

    expect(onSelect).toHaveBeenCalledWith("single");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
