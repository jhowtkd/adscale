import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "./route";

vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/beta-sessions", () => ({
  createBetaSession: vi.fn(),
  listBetaSessions: vi.fn(),
  BetaSessionError: class BetaSessionError extends Error {
    constructor(public code: string) {
      super(code);
    }
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import {
  createBetaSession,
  listBetaSessions,
} from "@/server/repositories/beta-sessions";

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const SESSION_ID = "550e8400-e29b-41d4-a716-446655440001";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockCreate = vi.mocked(createBetaSession);
const mockList = vi.mocked(listBetaSessions);

describe("/api/feedback/beta-sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({ user: { id: "owner-1", email: "owner@test.com" } });
  });

  it("POST starts session for platform owner", async () => {
    mockCreate.mockResolvedValue({
      id: SESSION_ID,
      workspaceId: WORKSPACE_ID,
      cohortLabel: "cohort-a",
      assistanceLevel: "hands_on",
      startedAt: new Date(),
      endedAt: null,
      operatorNotes: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await POST(
      new Request("http://localhost/api/feedback/beta-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: WORKSPACE_ID,
          cohortLabel: "cohort-a",
        }),
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.session.id).toBe(SESSION_ID);
  });

  it("GET lists sessions with filters", async () => {
    mockList.mockResolvedValue([]);

    const res = await GET(
      new Request(
        `http://localhost/api/feedback/beta-sessions?workspaceId=${WORKSPACE_ID}&activeOnly=true`
      )
    );

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      activeOnly: true,
    });
  });

  it("returns 403 when not platform owner", async () => {
    const { WorkspaceAuthError, AUTH_ERROR_CODES } = await import(
      "@/server/auth/errors"
    );
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await GET(new Request("http://localhost/api/feedback/beta-sessions"));

    expect(res.status).toBe(403);
  });
});
