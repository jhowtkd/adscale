import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FeedbackDocsLink from "./FeedbackDocsLink";

const openFeedback = vi.fn();

vi.mock("./FeedbackProvider", () => ({
  useFeedback: () => ({ openFeedback }),
}));

describe("FeedbackDocsLink", () => {
  it("opens the workspace feedback form for ordinary users", () => {
    render(
      <FeedbackDocsLink
        title="Feedback"
        description="Send a question"
        ariaLabel="Open Feedback"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Feedback" }));

    expect(openFeedback).toHaveBeenCalledWith();
  });
});
