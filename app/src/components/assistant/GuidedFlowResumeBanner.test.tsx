import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GuidedFlowResumeBanner from "./GuidedFlowResumeBanner";
import type { GuidedFlow } from "@/lib/hooks/use-guided-flow";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    if (key === "missingFields" && vars) {
      return `${vars.count} pending`;
    }
    if (key === "nextActionHint" && vars) {
      return `Next: ${vars.step}`;
    }
    return key;
  },
}));

const flow: GuidedFlow = {
  id: "flow-1",
  workspaceId: "ws-1",
  clientProfileId: "profile-1",
  threadId: "thread-1",
  path: "from_zero",
  status: "active",
  currentStep: "collect_brief",
  slots: {},
  missingFields: ["offer", "audience"],
  assetIds: [],
  referenceIds: [],
  campaignId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("GuidedFlowResumeBanner", () => {
  it("shows path, step and missing field count", () => {
    render(<GuidedFlowResumeBanner guidedFlow={flow} />);

    expect(screen.getByTestId("guided-flow-resume-banner")).toBeInTheDocument();
    expect(screen.getByText("2 pending")).toBeInTheDocument();
  });

  it("returns null for unclassified path", () => {
    const { container } = render(
      <GuidedFlowResumeBanner
        guidedFlow={{ ...flow, path: "unclassified" }}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
