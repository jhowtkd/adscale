import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreativeToolCards } from "./CreativeToolCards";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => ({
  variations: "Variações", single: "Peça única", format_adaptation: "Adaptar formatos", restyle: "Mudar estilo",
  carousel: "Criar carrossel",
  variationsDescription: "desc", singleDescription: "desc", format_adaptationDescription: "desc", restyleDescription: "desc",
  carouselDescription: "Transforme uma ideia ou texto em uma sequência visual coerente.",
  suggestedFromHistory: "Sugestão a partir do histórico",
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
    ["single", "Peça única", "creative-composer-request", false],
    ["variations", "Variações", "creative-composer-dropzone", false],
    ["format_adaptation", "Adaptar formatos", "creative-composer-dropzone", false],
    ["restyle", "Mudar estilo", "creative-composer-original-source", false],
    ["carousel", "Criar carrossel", "creative-composer-request", true],
  ] as const)("focuses the first revealed decision for %s", async (intent, label, targetId, carouselEnabled) => {
    const onSelect = vi.fn();
    const target = document.createElement("div");
    target.id = targetId;
    target.tabIndex = -1;
    document.body.append(target);
    const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    render(<CreativeToolCards selected={null} onSelect={onSelect} carouselEnabled={carouselEnabled} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}`, "i") }));

    expect(onSelect).toHaveBeenCalledWith(intent);
    await waitFor(() => expect(target).toHaveFocus());

    frame.mockRestore();
    target.remove();
  });

  it("waits for a confirmed selection before focusing its target", async () => {
    let resolveSelection: (value: boolean) => void;
    const onSelect = vi.fn(() => new Promise<boolean>((resolve) => { resolveSelection = resolve; }));
    const target = document.createElement("div");
    target.id = "creative-composer-dropzone";
    target.tabIndex = -1;
    document.body.append(target);
    const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    render(<CreativeToolCards selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /^variações/i }));

    expect(target).not.toHaveFocus();
    resolveSelection!(true);
    await waitFor(() => expect(target).toHaveFocus());

    frame.mockRestore();
    target.remove();
  });

  it("does not focus when protocol selection is cancelled", async () => {
    const target = document.createElement("div");
    target.id = "creative-composer-original-source";
    target.tabIndex = -1;
    document.body.append(target);
    const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    render(<CreativeToolCards selected={null} onSelect={vi.fn().mockResolvedValue(false)} />);
    fireEvent.click(screen.getByRole("button", { name: /^mudar estilo/i }));

    await Promise.resolve();
    expect(target).not.toHaveFocus();
    expect(frame).not.toHaveBeenCalled();

    frame.mockRestore();
    target.remove();
  });

  it("offers the fifth explicit carousel card only when the rollout enables creation", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<CreativeToolCards selected={null} onSelect={onSelect} />);

    expect(screen.queryByRole("button", { name: /^criar carrossel/i })).not.toBeInTheDocument();

    rerender(<CreativeToolCards selected={null} onSelect={onSelect} carouselEnabled />);
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(5);
    expect(screen.getByRole("button", { name: /^criar carrossel/i })).toHaveTextContent(
      "Transforme uma ideia ou texto em uma sequência visual coerente.",
    );

    fireEvent.click(screen.getByRole("button", { name: /^criar carrossel/i }));
    expect(onSelect).toHaveBeenCalledWith("carousel");
  });

  it("marks a history suggestion without pressing the card", () => {
    render(<CreativeToolCards selected={null} suggested="single" onSelect={vi.fn()} />);
    const card = screen.getByRole("button", { name: /^peça única/i });
    expect(card).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Sugestão a partir do histórico")).toBeInTheDocument();
  });

  it("keeps a resumed carousel deep link readable while new creation stays disabled", () => {
    render(<CreativeToolCards selected="carousel" onSelect={vi.fn()} />);

    const card = screen.getByRole("button", { name: /^criar carrossel/i });
    expect(card).toBeDisabled();
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(card).toHaveTextContent("Transforme uma ideia ou texto em uma sequência visual coerente.");
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(4);
  });
});
