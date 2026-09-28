import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import EquipeCard from "./EquipeCard";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

describe("EquipeCard idea", () => {
  it("links to the idea on the ideas screen", () => {
    render(
      <EquipeCard
        equipeEnabled
        card={{
          kind: "idea",
          accountId: "acc-1",
          title: "December gifts",
          summary: "Gift kit focus",
          ideaId: "idea-1",
          items: [],
        }}
      />,
    );
    expect(screen.getByTestId("equipe-card-idea")).toHaveTextContent("Gift kit focus");
    expect(screen.getByTestId("equipe-card-idea-link")).toHaveAttribute(
      "href",
      "/ideas?account=acc-1&idea=idea-1",
    );
  });
});
