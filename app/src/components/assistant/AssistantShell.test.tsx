import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AssistantShell from "./AssistantShell";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("AssistantShell", () => {
  it("renders desktop three-column regions with slot content", () => {
    render(
      <AssistantShell
        sidebar={<div>Sidebar slot</div>}
        main={<div>Main slot</div>}
        contextPanel={<div>Context slot</div>}
      />
    );

    expect(screen.getByTestId("assistant-desktop-layout")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-desktop-sidebar")).toHaveTextContent("Sidebar slot");
    expect(screen.getByTestId("assistant-desktop-main")).toHaveTextContent("Main slot");
    expect(screen.getByTestId("assistant-desktop-context")).toHaveTextContent("Context slot");
  });

  it("renders mobile tabs and switches visible panel", () => {
    render(
      <AssistantShell
        sidebar={<div>Sidebar slot</div>}
        main={<div>Main slot</div>}
        contextPanel={<div>Context slot</div>}
      />
    );

    expect(screen.getByTestId("assistant-mobile-layout")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-mobile-chat")).toHaveTextContent("Main slot");

    fireEvent.click(screen.getByRole("button", { name: "tree" }));
    expect(screen.getByTestId("assistant-mobile-tree")).toHaveTextContent("Sidebar slot");

    fireEvent.click(screen.getByRole("button", { name: "context" }));
    expect(screen.getByTestId("assistant-mobile-context")).toHaveTextContent("Context slot");
  });
});
