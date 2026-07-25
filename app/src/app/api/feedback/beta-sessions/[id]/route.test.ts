import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH } from "./route";

vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/beta-sessions", () => ({
  getBetaSessionByIdOnly: vi.fn(),
  endBetaSession: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import {
  endBetaSession,
  getBetaSessionByIdOnly,
} from "@/server/repositories/beta-sessions";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440001";

const mockSession = {
  id: SESSION_ID,
  workspaceId: "550e8400-e29b-41d4-a716-446655440002",
  cohortLabel: null,
  assistanceLevel: "hands_on",
  startedAt: new Date(),
  endedAt: null,
  operatorNotes: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("/api/feedback/beta-sessions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requirePlatformOwner).mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
  });

  it("GET returns session by id", async () => {
    vi.mocked(getBetaSessionByIdOnly).mockResolvedValue(mockSession);

    const res = await GET(
      new Request(`http://localhost/api/feedback/beta-sessions/${SESSION_ID}`),
      { params: Promise.resolve({ id: SESSION_ID }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session.id).toBe(SESSION_ID);
  });

  it("PATCH ends session", async () => {
    vi.mocked(endBetaSession).mockResolvedValue({
      ...mockSession,
      endedAt: new Date("2026-06-07T16:00:00.000Z"),
    });

    const res = await PATCH(
      new Request(`http://localhost/api/feedback/beta-sessions/${SESSION_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: SESSION_ID }) }
    );

    expect(res.status).toBe(200);
    expect(endBetaSession).toHaveBeenCalledWith(SESSION_ID, expect.any(Date));
  });

  it("GET returns 404 when session missing", async () => {
    vi.mocked(getBetaSessionByIdOnly).mockResolvedValue(null);

    const res = await GET(
      new Request(`http://localhost/api/feedback/beta-sessions/${SESSION_ID}`),
      { params: Promise.resolve({ id: SESSION_ID }) }
    );

    expect(res.status).toBe(404);
  });
});
