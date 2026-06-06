import { describe, expect, it } from "vitest";
import { classifyMissionInsightSignal } from "./mission-credit-signals";

describe("mission credit signal classification", () => {
  it("flags credit friction as frustration", () => {
    expect(
      classifyMissionInsightSignal({
        diagnosticContext: {
          source: "mission_insight",
          moment: "credit_friction",
        },
      })
    ).toBe("frustration");
  });

  it("flags positive preview moment as healthy", () => {
    expect(
      classifyMissionInsightSignal({
        diagnosticContext: {
          source: "mission_insight",
          moment: "preview_first",
          sentiment: "positive",
        },
      })
    ).toBe("healthy");
  });

  it("flags skipped preview mission as frustration", () => {
    expect(
      classifyMissionInsightSignal({
        diagnosticContext: {
          source: "mission_insight",
          moment: "mission_skipped",
          missionKey: "preview",
        },
      })
    ).toBe("frustration");
  });

  it("ignores non-mission insights", () => {
    expect(
      classifyMissionInsightSignal({
        diagnosticContext: { source: "feedback_widget" },
      })
    ).toBeNull();
  });
});
