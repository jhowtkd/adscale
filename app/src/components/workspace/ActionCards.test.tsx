import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ActionCards from "./ActionCards";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === "blockingBeforeDerivar" && values?.count) {
      return `${values.count} blocking issues before derive`;
    }
    return key;
  },
}));

describe("ActionCards", () => {
  it("shows readiness blocking banner before derive actions", () => {
    render(
      <ActionCards
        onDerivar={vi.fn()}
        onEstilizar={vi.fn()}
        readinessBlocking={{ blockingCount: 2, topIssue: "CTA is missing" }}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("2 blocking issues before derive");
    expect(screen.getByText("CTA is missing")).toBeInTheDocument();
  });

  it("hides blocking banner when no blockers", () => {
    render(<ActionCards onDerivar={vi.fn()} onEstilizar={vi.fn()} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
