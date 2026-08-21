import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
      privacyNote: "Voice audio notice",
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
vi.mock("@/components/ui/VoiceInputButton", () => ({
  default: ({ onTranscript, onBusyChange }: { onTranscript: (text: string) => void; onBusyChange?: (busy: boolean) => void }) => <div><button type="button" onClick={() => onTranscript("Texto ditado")}>mock voice</button><button type="button" onClick={() => onBusyChange?.(true)}>mock busy</button></div>,
  appendTranscript: (current: string, text: string, max: number) => [current, text].filter(Boolean).join(" ").slice(0, max),
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
    expect(screen.getByText("Voice audio notice")).toBeVisible();
  });

  it("appends voice feedback and blocks submit while voice is busy", () => {
    render(<FeedbackModal open onOpenChange={vi.fn()} context={{ contextKind: "global" }} submitting={false} onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Atual" } });
    fireEvent.click(screen.getByRole("button", { name: "mock voice" }));
    expect(screen.getByLabelText("Message")).toHaveValue("Atual Texto ditado");
    fireEvent.click(screen.getByRole("button", { name: "mock busy" }));
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
  });
});
