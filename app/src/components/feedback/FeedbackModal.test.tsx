import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import FeedbackModal from "./FeedbackModal";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === "routeContext" && values?.route) {
      return `Route: ${values.route}`;
    }
    const labels: Record<string, string> = {
      title: "Feedback",
      description: "Tell us",
      type: "Type",
      severity: "Severity",
      category: "Category",
      message: "Message",
      messagePlaceholder: "Details",
      followUp: "Follow up",
      privacyNote: "Privacy",
      cancel: "Cancel",
      submit: "Submit",
      "types.suggestion": "Suggestion",
      "types.bug": "Bug",
      "severities.medium": "Medium",
      "categories.billing": "Billing",
      "categories.ui": "UI",
    };
    return labels[key] ?? key;
  },
}));

describe("FeedbackModal", () => {
  it("pre-fills mission friction context with route and billing category", () => {
    render(
      <FeedbackModal
        open
        onOpenChange={vi.fn()}
        context={{
          contextKind: "mission_friction",
          route: "/campaigns/c1?tab=recipes",
          frustrationMoment: "credit_friction",
          prefillCategory: "billing",
          prefillType: "suggestion",
        }}
        submitting={false}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText("Route: /campaigns/c1?tab=recipes")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Suggestion")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Billing")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Friction during credit friction")
    ).toBeInTheDocument();
  });
});
