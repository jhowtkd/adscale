import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CreativeTripletGrid from "./CreativeTripletGrid";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const candidates = [
  {
    versionId: "00000000-0000-4000-8000-000000000011",
    derivationId: "00000000-0000-4000-8000-000000000011",
    creativeLevel: "conservative" as const,
    format: "1:1",
    status: "ready" as const,
    previewUrl: "https://cdn.test/conservative.png",
  },
  {
    versionId: "00000000-0000-4000-8000-000000000012",
    derivationId: "00000000-0000-4000-8000-000000000012",
    creativeLevel: "balanced" as const,
    format: "1:1",
    status: "ready" as const,
    previewUrl: "https://cdn.test/balanced.png",
  },
  {
    versionId: "00000000-0000-4000-8000-000000000013",
    derivationId: "00000000-0000-4000-8000-000000000013",
    creativeLevel: "bold" as const,
    format: "1:1",
    status: "ready" as const,
    previewUrl: "https://cdn.test/bold.png",
  },
];

describe("CreativeTripletGrid", () => {
  it("renders three candidates at equal visual weight in fixed level order", () => {
    render(
      <CreativeTripletGrid
        candidates={candidates}
        expectedRevision={4}
        onSelectBase={vi.fn()}
      />
    );

    const cards = screen.getAllByTestId(/^assistant-triplet-card-/);
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveAttribute("data-creative-level", "conservative");
    expect(cards[1]).toHaveAttribute("data-creative-level", "balanced");
    expect(cards[2]).toHaveAttribute("data-creative-level", "bold");
    // Equal weight: every card has the same width class.
    const widths = new Set(cards.map((c) => c.className));
    expect(widths.size).toBe(1);
  });

  it("does not rank or recommend a candidate", () => {
    render(
      <CreativeTripletGrid
        candidates={candidates}
        expectedRevision={4}
        onSelectBase={vi.fn()}
      />
    );

    expect(screen.queryByText(/recomend/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/melhor/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/winner|badge/)).not.toBeInTheDocument();
  });

  it("shows a failed slot after final retry failure", () => {
    const withFailed = [
      ...candidates.slice(0, 2),
      { ...candidates[2], status: "failed" as const, previewUrl: null },
    ];
    render(
      <CreativeTripletGrid
        candidates={withFailed}
        expectedRevision={4}
        onSelectBase={vi.fn()}
      />
    );

    expect(screen.getByTestId("assistant-triplet-card-bold")).toHaveTextContent(
      "failed"
    );
  });

  it("selects only a ready candidate and reports the version id", () => {
    const onSelect = vi.fn();
    render(
      <CreativeTripletGrid
        candidates={candidates}
        expectedRevision={4}
        onSelectBase={onSelect}
      />
    );

    fireEvent.click(screen.getByTestId("assistant-triplet-select-balanced"));

    expect(onSelect).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000012",
      4
    );
  });

  it("disables selection for a running candidate", () => {
    const running = [
      ...candidates.slice(0, 2),
      { ...candidates[2], status: "running" as const },
    ];
    const onSelect = vi.fn();
    render(
      <CreativeTripletGrid
        candidates={running}
        expectedRevision={4}
        onSelectBase={onSelect}
      />
    );

    expect(
      screen.getByTestId("assistant-triplet-select-bold")
    ).toBeDisabled();
  });
});
