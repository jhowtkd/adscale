import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CarouselHook } from "@/server/creative-work/carousel-editorial-state";
import { CarouselHookChoices } from "./CarouselHookChoices";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => ({
    hooksTitle: "Escolha um gancho",
    hooksHint: "Três caminhos distintos; a escolha não gera imagem.",
    regenerateHooks: "Novas opções",
    hookRecommendation: "Recomendação",
    recommendedBadge: "Recomendado",
    hookHeadlineLabel: "Texto de capa",
    hookPromise: "Promessa",
    hookNarrative: "Percurso",
    chooseHook: "Escolher gancho",
  }[key] ?? key),
}));

const hooks: CarouselHook[] = [
  { id: "hook-1", headline: "Grupo em agosto", promise: "Vagas limitadas", narrative: "Fato, prova, inscrição" },
  { id: "hook-2", headline: "Comece o cuidado", promise: "Rotina em grupo", narrative: "Dor, método, convite" },
  { id: "hook-3", headline: "Agosto abre vagas", promise: "Turma pequena", narrative: "Novidade, critério, CTA" },
];

describe("CarouselHookChoices", () => {
  it("shows headline, promise, narrative and recommendation for three hooks", () => {
    render(
      <CarouselHookChoices
        hooks={hooks}
        recommendedHookId="hook-1"
        recommendation="Abre com o fato datado."
        busy={false}
        onSelect={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: /Escolher gancho/ })).toHaveLength(3);
    expect(screen.getByTestId("carousel-hook-recommendation")).toHaveTextContent("Abre com o fato datado.");
    expect(screen.getByTestId("carousel-hook-hook-1")).toHaveTextContent("Vagas limitadas");
    expect(screen.getByTestId("carousel-hook-hook-1")).toHaveTextContent("Fato, prova, inscrição");
    expect(screen.getByTestId("carousel-hook-hook-1")).toHaveTextContent("Recomendado");
  });

  it("selects a hook without implying image confirmation", () => {
    const onSelect = vi.fn();
    render(
      <CarouselHookChoices
        hooks={hooks}
        recommendedHookId="hook-1"
        recommendation="Abre com o fato datado."
        busy={false}
        onSelect={onSelect}
        onRegenerate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Escolher gancho/ })[1]!);
    expect(onSelect).toHaveBeenCalledWith("hook-2", undefined);
  });

  it("sends an edited headline with the selection", () => {
    const onSelect = vi.fn();
    render(
      <CarouselHookChoices
        hooks={hooks}
        recommendedHookId="hook-1"
        recommendation={null}
        busy={false}
        onSelect={onSelect}
        onRegenerate={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Texto de capa — Grupo em agosto"), {
      target: { value: "Vagas agora no grupo" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /Escolher gancho/ })[0]!);
    expect(onSelect).toHaveBeenCalledWith("hook-1", "Vagas agora no grupo");
  });

  it("regenerates options and disables choices while busy", () => {
    const onRegenerate = vi.fn();
    const onSelect = vi.fn();
    const { rerender } = render(
      <CarouselHookChoices
        hooks={hooks}
        recommendedHookId="hook-1"
        recommendation={null}
        busy={false}
        onSelect={onSelect}
        onRegenerate={onRegenerate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Novas opções" }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);

    rerender(
      <CarouselHookChoices
        hooks={hooks}
        recommendedHookId="hook-1"
        recommendation={null}
        busy
        onSelect={onSelect}
        onRegenerate={onRegenerate}
      />,
    );
    expect(screen.getAllByRole("button", { name: /Escolher gancho/ })[0]).toBeDisabled();
    expect(screen.getByRole("button", { name: "Novas opções" })).toBeDisabled();
  });
});
