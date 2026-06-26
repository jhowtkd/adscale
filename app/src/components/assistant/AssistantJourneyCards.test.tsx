import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AssistantJourneyCards from "./AssistantJourneyCards";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("AssistantJourneyCards", () => {
  it("renders both journey cards", () => {
    render(<AssistantJourneyCards onSelectPath={vi.fn()} />);

    expect(screen.getByTestId("assistant-journey-cards")).toBeInTheDocument();
    expect(
      screen.getByTestId("assistant-journey-card-existing_creative")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("assistant-journey-card-from_zero")
    ).toBeInTheDocument();
  });

  it("calls onSelectPath when a card is clicked", () => {
    const onSelectPath = vi.fn();
    render(<AssistantJourneyCards onSelectPath={onSelectPath} />);

    fireEvent.click(screen.getByTestId("assistant-journey-card-from_zero"));

    expect(onSelectPath).toHaveBeenCalledWith("from_zero");
  });
});
