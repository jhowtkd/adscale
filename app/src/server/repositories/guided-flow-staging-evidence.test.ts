import { describe, expect, it } from "vitest";
import {
  sanitizeStagingSafeNotes,
  summarizeStagingCoverage,
} from "./guided-flow-staging-evidence";

describe("guided-flow-staging-evidence helpers", () => {
  it("summarizes path coverage", () => {
    const summary = summarizeStagingCoverage([
      {
        id: "1",
        workspaceId: "ws",
        clientProfileId: "cp",
        threadId: "t1",
        campaignId: null,
        path: "existing_creative",
        environment: "staging",
        reviewerUserId: "u1",
        checkKey: "diagnosis",
        verdict: "pass",
        safeNotes: null,
        referenceCounts: {},
        createdAt: new Date(),
      },
      {
        id: "2",
        workspaceId: "ws",
        clientProfileId: "cp",
        threadId: "t2",
        campaignId: null,
        path: "from_zero",
        environment: "staging",
        reviewerUserId: "u1",
        checkKey: "briefing",
        verdict: "tech_debt",
        safeNotes: "provider timeout",
        referenceCounts: { references: 3 },
        createdAt: new Date(),
      },
    ] as never);

    expect(summary.existingCreativeCovered).toBe(true);
    expect(summary.fromZeroCovered).toBe(true);
    expect(summary.techDebtCount).toBe(1);
  });

  it("sanitizes safe notes length", () => {
    expect(sanitizeStagingSafeNotes("note")?.length).toBe(4);
    expect(sanitizeStagingSafeNotes("n".repeat(400))?.length).toBe(256);
  });
});
