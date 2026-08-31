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

  it("accepts free entry before an objective is selected", () => {
    render(<CreativeToolCards selected={null} onSelect={vi.fn()} />);

    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(4);
  });

  it.each([
    ["single", "Peça única", "creative-composer-request"],
    ["variations", "Variações", "creative-composer-dropzone"],
    ["format_adaptation", "Adaptar formatos", "creative-composer-dropzone"],
    ["restyle", "Mudar estilo", "creative-composer-original-source"],
  ] as const)("focuses the first revealed decision for %s", (intent, label, targetId) => {
    const onSelect = vi.fn();
    const target = document.createElement("div");
    target.id = targetId;
    target.tabIndex = -1;
    document.body.append(target);
    const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    render(<CreativeToolCards selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}`, "i") }));

    expect(onSelect).toHaveBeenCalledWith(intent);
    expect(target).toHaveFocus();

    frame.mockRestore();
    target.remove();
  });
});
