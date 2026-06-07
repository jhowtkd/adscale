import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("./beta-analytics", () => ({
  listBetaAnalyticsEvents: vi.fn(() => Promise.resolve([])),
}));

import { db } from "../db";
import {
  createBetaSession,
  endBetaSession,
  getBetaSessionByIdOnly,
  listBetaSessions,
  mergeBetaSessionNotes,
  workspaceExists,
} from "./beta-sessions";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440001";
const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";

function mockSelectChain(result: unknown[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  vi.mocked(db.select).mockReturnValue({ from } as never);
  return { from, where, limit };
}

describe("beta-sessions repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("workspaceExists returns true when workspace row found", async () => {
    mockSelectChain([{ id: WORKSPACE_ID }]);
    await expect(workspaceExists(WORKSPACE_ID)).resolves.toBe(true);
  });

  it("createBetaSession inserts with default hands_on assistance", async () => {
    mockSelectChain([{ id: WORKSPACE_ID }]);
    const returning = vi.fn().mockResolvedValue([
      {
        id: SESSION_ID,
        workspaceId: WORKSPACE_ID,
        cohortLabel: null,
        assistanceLevel: "hands_on",
        startedAt: new Date(),
        endedAt: null,
        operatorNotes: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const values = vi.fn(() => ({ returning }));
    vi.mocked(db.insert).mockReturnValue({ values } as never);

    const session = await createBetaSession({ workspaceId: WORKSPACE_ID });

    expect(session.assistanceLevel).toBe("hands_on");
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE_ID })
    );
  });

  it("listBetaSessions applies activeOnly filter", async () => {
    const where = vi.fn().mockResolvedValue([]);
    const from = vi.fn(() => ({ where }));
    vi.mocked(db.select).mockReturnValue({ from } as never);

    await listBetaSessions({ workspaceId: WORKSPACE_ID, activeOnly: true });

    expect(where).toHaveBeenCalled();
  });

  it("endBetaSession sets endedAt", async () => {
    const endedAt = new Date("2026-06-07T15:00:00.000Z");
    const returning = vi.fn().mockResolvedValue([
      {
        id: SESSION_ID,
        workspaceId: WORKSPACE_ID,
        endedAt,
      },
    ]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    vi.mocked(db.update).mockReturnValue({ set } as never);

    const session = await endBetaSession(SESSION_ID, endedAt);

    expect(session?.endedAt).toEqual(endedAt);
  });

  it("mergeBetaSessionNotes preserves unrelated stages", async () => {
    mockSelectChain([
      {
        id: SESSION_ID,
        workspaceId: WORKSPACE_ID,
        operatorNotes: {
          setup: { notes: "existing setup", completedAt: "2026-06-07T10:00:00.000Z" },
        },
      },
    ]);

    const returning = vi.fn().mockResolvedValue([
      {
        id: SESSION_ID,
        operatorNotes: {
          setup: { notes: "existing setup", completedAt: "2026-06-07T10:00:00.000Z" },
          readiness: { notes: "ran analysis", completedAt: "2026-06-07T11:00:00.000Z" },
        },
      },
    ]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    vi.mocked(db.update).mockReturnValue({ set } as never);

    const session = await mergeBetaSessionNotes(SESSION_ID, {
      readiness: { notes: "ran analysis", completedAt: "2026-06-07T11:00:00.000Z" },
    });

    expect(session?.operatorNotes).toMatchObject({
      setup: expect.objectContaining({ notes: "existing setup" }),
      readiness: expect.objectContaining({ notes: "ran analysis" }),
    });
  });

  it("getBetaSessionByIdOnly returns session", async () => {
    mockSelectChain([{ id: SESSION_ID, workspaceId: WORKSPACE_ID }]);
    const session = await getBetaSessionByIdOnly(SESSION_ID);
    expect(session?.id).toBe(SESSION_ID);
  });
});
