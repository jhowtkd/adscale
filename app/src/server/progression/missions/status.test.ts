import { describe, expect, it } from "vitest";
import type { MissionKey } from "@/lib/progression/missions/types";
import {
  buildMissionStatuses,
  calculateMissionProgressPercent,
  findActiveMissionKey,
} from "./status";
import type { InferredMissionCompletion } from "./evidence";
import { missionBriefingSatisfied } from "./evidence";

const emptyContext = { firstCampaignId: null, evidence: [] };

describe("mission status", () => {
  it("marks first incomplete mission as active when prerequisites are met", () => {
    const completions: InferredMissionCompletion[] = [
      { key: "setup", completedAt: new Date("2026-06-01") },
    ];

    const missions = buildMissionStatuses(completions, emptyContext);
    const upload = missions.find((mission) => mission.key === "upload");

    expect(upload?.status).toBe("active");
    expect(findActiveMissionKey(missions)).toBe("upload");
  });

  it("blocks missions when prerequisite is missing", () => {
    const missions = buildMissionStatuses([], emptyContext);
    const readiness = missions.find((mission) => mission.key === "readiness");

    expect(readiness?.status).toBe("blocked");
    expect(readiness?.blockedReason).toContain("criativo base");
  });

  it("calculates progress percent from completed missions", () => {
    const completions: MissionKey[] = ["setup", "upload"];
    const missions = buildMissionStatuses(
      completions.map((key) => ({ key, completedAt: new Date("2026-06-01") })),
      emptyContext
    );

    expect(calculateMissionProgressPercent(missions)).toBe(
      Math.round((2 / missions.length) * 100)
    );
  });

  it("detects guided briefing satisfaction", () => {
    expect(
      missionBriefingSatisfied({
        objective: "Vender mais",
        audience: "PMEs",
      })
    ).toBe(true);

    expect(
      missionBriefingSatisfied({
        objective: "Vender mais",
      })
    ).toBe(false);
  });
});
