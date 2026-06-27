import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  insertResult: [] as unknown[],
  updateResult: [] as unknown[],
  deleteResult: [] as unknown[],
}));

vi.mock("@/server/db", () => {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(async () => state.selectResults.shift() ?? []),
    then(resolve: (value: unknown) => void) {
      resolve(state.selectResults.shift() ?? []);
    },
  };

  return {
    db: {
      select: vi.fn(() => chain),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn(() => ({
            returning: vi.fn(async () => state.insertResult),
          })),
          returning: vi.fn(async () => state.insertResult),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => state.updateResult),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => state.deleteResult),
        })),
      })),
    },
  };
});

import {
  clearPlanFeedbackDraft,
  getPlanFeedbackDraft,
  PlanFeedbackDraftValidationError,
  savePlanFeedbackDraft,
} from "./draft";

const scope = {
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  campaignId: "campaign-1",
  threadId: "thread-1",
};

describe("plan feedback draft persistence", () => {
  beforeEach(() => {
    state.selectResults = [];
    state.insertResult = [];
    state.updateResult = [];
    state.deleteResult = [];
    vi.clearAllMocks();
  });

  it("returns null when no draft exists for thread", async () => {
    state.selectResults.push([]);
    await expect(getPlanFeedbackDraft(scope)).resolves.toBeNull();
  });

  it("saves and loads draft scoped to thread", async () => {
    const row = {
      threadId: scope.threadId,
      draftText: "Ajustar CTA principal",
      updatedAt: new Date("2026-06-27T12:00:00Z"),
    };
    state.insertResult = [row];

    const saved = await savePlanFeedbackDraft(scope, "Ajustar CTA principal");
    expect(saved.draftText).toBe("Ajustar CTA principal");

    state.selectResults.push([row]);
    await expect(getPlanFeedbackDraft(scope)).resolves.toEqual(row);
  });

  it("returns null for cross-thread read with different thread id", async () => {
    state.selectResults.push([]);
    await expect(
      getPlanFeedbackDraft({ ...scope, threadId: "thread-other" })
    ).resolves.toBeNull();
  });

  it("rejects draft text over 2000 characters", async () => {
    await expect(
      savePlanFeedbackDraft(scope, "x".repeat(2_001))
    ).rejects.toBeInstanceOf(PlanFeedbackDraftValidationError);
  });

  it("clears draft for thread", async () => {
    state.deleteResult = [{ threadId: scope.threadId }];
    await expect(clearPlanFeedbackDraft(scope)).resolves.toBe(true);
  });
});

describe("assistant_plan_feedback_drafts migration", () => {
  it("registers migration 0065 in drizzle journal", () => {
    const journalPath = resolve(process.cwd(), "drizzle/meta/_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      entries: { tag: string }[];
    };
    expect(
      journal.entries.some((entry) => entry.tag === "0065_assistant_plan_feedback_drafts")
    ).toBe(true);
  });
});
