import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

import { db } from "../db";
import {
  getWorkspaceProgressionSnapshot,
  upsertWorkspaceProgressionSnapshot,
} from "./progression";

describe("progression repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no snapshot exists", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as never);

    const result = await getWorkspaceProgressionSnapshot("workspace-1");
    expect(result).toBeNull();
  });

  it("creates snapshot when none exists", async () => {
    const selectLimit = vi.fn().mockResolvedValue([]);
    const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit });
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    vi.mocked(db.select).mockReturnValue({ from: selectFrom } as never);

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
          href: "/campaigns/new",
          blocked: false,
        },
        progressPercent: 0,
        lastCalculatedAt: new Date("2026-06-06T00:00:00.000Z"),
        createdAt: new Date("2026-06-06T00:00:00.000Z"),
        updatedAt: new Date("2026-06-06T00:00:00.000Z"),
      },
    ]);
    const insertValues = vi.fn().mockReturnValue({ returning });
    vi.mocked(db.insert).mockReturnValue({ values: insertValues } as never);

    const result = await upsertWorkspaceProgressionSnapshot({
      workspaceId: "workspace-1",
      levelKey: "aprendiz",
      completed: [],
      nextAction: {
        key: "campaign_created",
        label: "Primeira campanha",
        description: "Crie sua primeira campanha.",
        href: "/campaigns/new",
        blocked: false,
      },
      progressPercent: 0,
      lastCalculatedAt: new Date("2026-06-06T00:00:00.000Z"),
    });

    expect(result.workspaceId).toBe("workspace-1");
    expect(insertValues).toHaveBeenCalled();
  });
});
