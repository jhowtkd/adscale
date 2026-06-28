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
  clearCreativeFeedbackDraft,
  CreativeFeedbackDraftValidationError,
  getCreativeFeedbackDraft,
  saveCreativeFeedbackDraft,
} from "./draft";

const scope = {
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  campaignId: "campaign-1",
  threadId: "thread-1",
};

describe("creative feedback draft persistence", () => {
  beforeEach(() => {
    state.selectResults = [];
    state.insertResult = [];
    state.updateResult = [];
    state.deleteResult = [];
    vi.clearAllMocks();
  });

  it("returns null when no draft exists for thread", async () => {
    state.selectResults.push([]);
    await expect(getCreativeFeedbackDraft(scope)).resolves.toBeNull();
  });

  it("saves and loads draft scoped to thread", async () => {
    const row = {
      threadId: scope.threadId,
      draftText: "muda a cor",
      updatedAt: new Date("2026-06-27T12:00:00Z"),
    };
    state.insertResult = [row];

    const saved = await saveCreativeFeedbackDraft(scope, "muda a cor");
    expect(saved.draftText).toBe("muda a cor");

    state.selectResults.push([row]);
    await expect(getCreativeFeedbackDraft(scope)).resolves.toEqual(row);
  });

  it("upserts draft on conflict (second save replaces, not duplicates)", async () => {
    const firstRow = {
      threadId: scope.threadId,
      draftText: "first text",
      updatedAt: new Date("2026-06-27T12:00:00Z"),
    };
    const secondRow = {
      threadId: scope.threadId,
      draftText: "second text",
      updatedAt: new Date("2026-06-27T12:05:00Z"),
    };
    state.insertResult = [firstRow];
    await saveCreativeFeedbackDraft(scope, "first text");

    state.insertResult = [secondRow];
    await saveCreativeFeedbackDraft(scope, "second text");

    expect(state.insertResult[0]?.draftText).toBe("second text");
  });

  it("returns true on first clear and false on second clear", async () => {
    state.deleteResult = [{ threadId: scope.threadId }];
    await expect(clearCreativeFeedbackDraft(scope)).resolves.toBe(true);

    state.deleteResult = [];
    await expect(clearCreativeFeedbackDraft(scope)).resolves.toBe(false);
  });

  it("rejects draft text over 2000 characters", async () => {
    await expect(
      saveCreativeFeedbackDraft(scope, "x".repeat(2_001))
    ).rejects.toBeInstanceOf(CreativeFeedbackDraftValidationError);
  });

  it("returns null for cross-thread read with different thread id", async () => {
    state.selectResults.push([]);
    await expect(
      getCreativeFeedbackDraft({ ...scope, threadId: "thread-other" })
    ).resolves.toBeNull();
  });

  it("returns null for cross-workspace read", async () => {
    state.selectResults.push([]);
    await expect(
      getCreativeFeedbackDraft({ ...scope, workspaceId: "ws-other" })
    ).resolves.toBeNull();
  });
});

describe("assistant_creative_feedback_drafts migration", () => {
  it("registers migration 0066 in drizzle journal", () => {
    const journalPath = resolve(process.cwd(), "drizzle/meta/_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      entries: { tag: string }[];
    };
    expect(
      journal.entries.some(
        (entry) => entry.tag === "0066_assistant_creative_feedback_drafts"
      )
    ).toBe(true);
  });
});
