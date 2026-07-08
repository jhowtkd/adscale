import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  db: {
    insert: vi.fn(),
  },
}));

import { db } from "../db";
import { upsertWorkspaceProgressionSnapshot } from "./progression";

describe("progression repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses onConflictDoUpdate for atomic upsert", async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: "prog-1",
        workspaceId: "workspace-1",
        levelKey: "aprendiz",
        completed: [],
        nextAction: {
          key: "campaign_created",
          label: "Primeira campanha",
          description: "Crie sua primeira campanha.",
          href: "/campaigns?new=1",
          blocked: false,
        },
        progressPercent: 0,
        lastCalculatedAt: new Date("2026-06-06T00:00:00.000Z"),
        createdAt: new Date("2026-06-06T00:00:00.000Z"),
        updatedAt: new Date("2026-06-06T00:00:00.000Z"),
      },
    ]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    vi.mocked(db.insert).mockReturnValue({ values } as never);

    const result = await upsertWorkspaceProgressionSnapshot({
      workspaceId: "workspace-1",
      levelKey: "aprendiz",
      completed: [],
      nextAction: {
        key: "campaign_created",
        label: "Primeira campanha",
        description: "Crie sua primeira campanha.",
        href: "/campaigns?new=1",
        blocked: false,
      },
      progressPercent: 0,
      lastCalculatedAt: new Date("2026-06-06T00:00:00.000Z"),
    });

    expect(result.workspaceId).toBe("workspace-1");
    expect(onConflictDoUpdate).toHaveBeenCalled();
    expect(values).toHaveBeenCalled();
  });
});
