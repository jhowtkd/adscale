import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SettingsV6View from "./SettingsV6View";
import type { SettingsV6Card } from "./settings-v6-types";

const cards: SettingsV6Card[] = [
  {
    id: "profile",
    title: "Perfil",
    description: "Seus dados pessoais.",
    badge: "Disponível",
    badgeVariant: "success",
    actionLabel: "Abrir configurações",
    enabled: true,
    href: "/settings?tab=profile",
  },
  {
    id: "integrations",
    title: "Integrações",
    description: "Conecte outras ferramentas.",
    badge: "Em breve",
    badgeVariant: "neutral",
    actionLabel: "Em breve",
    enabled: false,
    href: "/settings?tab=integrations",
  },
];

describe("SettingsV6View", () => {
  it("renders the Open Design card grid and preserves card selection", () => {
    const onSelectCard = vi.fn();

    render(
      <SettingsV6View
        labels={{ sectionLabel: "Configurações", title: "Configurações do workspace", subtitle: "Gerencie tudo.", openCard: "Abrir", unavailable: "Indisponível" }}
        cards={cards}
        activeCardId="profile"
        onSelectCard={onSelectCard}
      />,
    );

    expect(screen.getByTestId("settings-card-grid")).toHaveClass("grid", "md:grid-cols-2", "xl:grid-cols-3");
    const profile = screen.getByRole("button", { name: /Perfil/ });
    expect(profile).toHaveAttribute("aria-current", "page");
    expect(profile).toContainElement(screen.getByText("Abrir configurações"));
    expect(screen.queryByRole("button", { name: /Integrações/ })).not.toBeInTheDocument();

    fireEvent.click(profile);
    expect(onSelectCard).toHaveBeenCalledWith("profile");
  });
});
