import { describe, expect, it } from "vitest";
import { studioStageOccupancy } from "./stage-occupancy";

describe("studioStageOccupancy", () => {
  it("keeps the first visit empty until the operator has work in progress", () => {
    expect(studioStageOccupancy({
      hasContinueWork: false,
      outputCount: 0,
      sourceCount: 0,
    })).toBe("empty");
  });

  it("docks the talk box only after the operator has work in progress", () => {
    expect(studioStageOccupancy({
      hasContinueWork: true,
      outputCount: 0,
      sourceCount: 0,
    })).toBe("work");
    expect(studioStageOccupancy({
      hasContinueWork: false,
      hasOpenWork: true,
      outputCount: 0,
      sourceCount: 0,
    })).toBe("work");
  });
});
