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
  it("selects a polished protocol card without separate help controls", () => {
    const onSelect = vi.fn();
    render(<CreativeToolCards selected="variations" onSelect={onSelect} />);

    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
    expect(screen.getByRole("button", { pressed: true })).toHaveClass(
      "border-[var(--selection-border)]",
      "bg-[var(--selection-bg)]",
      "ring-[var(--selection-border)]",
      "focus-visible:ring-[var(--focus-ring)]",
    );
    expect(screen.queryByRole("button", { name: /Ajuda sobre/i })).not.toBeInTheDocument();
    expect(screen.getAllByText("desc")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: /^peça única/i }));

    expect(onSelect).toHaveBeenCalledWith("single");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
