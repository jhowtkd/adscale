// GET /api/feedback/reports?access=1 is the shell's question "may this person open the platform inbox?" (ticket 13, D-11). It is asked on every page, so a
// person who may not gets a plain answer: the browser logged the old 403 as an error at every opening of the home.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_ERROR_CODES, WorkspaceAuthError } from "@/server/auth/errors";

vi.mock("@/server/auth/require-platform-owner", () => ({ requirePlatformOwner: vi.fn() }));
vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess: vi.fn() }));
vi.mock("@/server/repositories/feedback", () => ({ createFeedbackReport: vi.fn(), listFeedbackReports: vi.fn(async () => []) }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(() => Promise.resolve((key: string) => key)) }));

import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { listFeedbackReports } from "@/server/repositories/feedback";
import { GET } from "./route";

const mockOwner = vi.mocked(requirePlatformOwner);
const probe = () => GET(new Request("http://localhost/api/feedback/reports?access=1"));

describe("GET /api/feedback/reports?access=1", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a platform owner: 200 {allowed:true}, with no report listed", async () => {
    mockOwner.mockResolvedValue({ user: { email: "owner@test.com" } } as never);
    const res = await probe();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ allowed: true });
    expect(listFeedbackReports).not.toHaveBeenCalled();
  });

  it("anyone else: 200 {allowed:false}, not a 403", async () => {
    mockOwner.mockRejectedValue(new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden"));
    const res = await probe();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ allowed: false });
    expect(listFeedbackReports).not.toHaveBeenCalled();
  });

  it("no session is still a 401", async () => {
    mockOwner.mockRejectedValue(new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized"));
    expect((await probe()).status).toBe(401);
  });

  it("an unexpected failure is an error, never a quiet {allowed:false}", async () => {
    mockOwner.mockRejectedValue(new Error("session store down"));
    expect((await probe()).status).toBe(500);
  });

  it("without the probe the inbox itself is still closed to a person who may not open it", async () => {
    mockOwner.mockRejectedValue(new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden"));
    expect((await GET(new Request("http://localhost/api/feedback/reports"))).status).toBe(403);
    expect(listFeedbackReports).not.toHaveBeenCalled();
  });
});
