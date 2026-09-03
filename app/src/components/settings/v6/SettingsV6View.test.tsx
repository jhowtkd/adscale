import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SettingsV6View from "./SettingsV6View";
import type { SettingsV6Card } from "./settings-v6-types";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    onClick?: () => void;
  }) => (
    <a href={href} onClick={onClick} {...props}>
      {children}
    </a>
  ),
}));

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
  it("uses a standard settings nav instead of Palco mode radios", () => {
    render(
      <SettingsV6View
        labels={{ sectionLabel: "Configurações", title: "Configurações do workspace", subtitle: "Gerencie tudo.", openCard: "Abrir", unavailable: "Em breve" }}
        cards={cards}
        activeCardId="profile"
      />,
    );

    expect(screen.getByRole("heading", { name: "Configurações" })).toBeVisible();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    const profile = screen.getByRole("link", { name: "Perfil" });
    expect(profile).toHaveAttribute("aria-current", "page");
    expect(profile).toHaveAttribute("href", "/settings?tab=profile");
    expect(screen.getByRole("heading", { name: "Perfil" })).toBeVisible();
    expect(screen.getByText("Seus dados pessoais.")).toBeVisible();
    expect(screen.getByText("Integrações")).not.toHaveAttribute("href");
  });
});
