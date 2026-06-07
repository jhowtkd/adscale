import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "./route";

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/beta-sessions", () => ({
  mergeBetaSessionNotes: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { mergeBetaSessionNotes } from "@/server/repositories/beta-sessions";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440001";

describe("PATCH /api/feedback/beta-sessions/[id]/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requirePlatformOwner).mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
  });

  it("merges stage notes", async () => {
    vi.mocked(mergeBetaSessionNotes).mockResolvedValue({
      id: SESSION_ID,
      workspaceId: "550e8400-e29b-41d4-a716-446655440002",
      cohortLabel: null,
      assistanceLevel: "hands_on",
      startedAt: new Date(),
      endedAt: null,
      operatorNotes: {
        readiness: {
          notes: "Analysis complete",
          completedAt: "2026-06-07T11:00:00.000Z",
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await PATCH(
      new Request(`http://localhost/api/feedback/beta-sessions/${SESSION_ID}/notes`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stages: {
            readiness: {
              notes: "Analysis complete",
              completedAt: "2026-06-07T11:00:00.000Z",
            },
          },
        }),
      }),
      { params: Promise.resolve({ id: SESSION_ID }) }
    );

    expect(res.status).toBe(200);
    expect(mergeBetaSessionNotes).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        readiness: expect.objectContaining({ notes: "Analysis complete" }),
      })
    );
  });

  it("rejects invalid stage keys", async () => {
    const res = await PATCH(
      new Request(`http://localhost/api/feedback/beta-sessions/${SESSION_ID}/notes`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stages: { invalid: { notes: "x" } },
        }),
      }),
      { params: Promise.resolve({ id: SESSION_ID }) }
    );

    expect(res.status).toBe(400);
  });
});
