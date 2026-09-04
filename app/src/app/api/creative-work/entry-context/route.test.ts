import { beforeEach, describe, expect, it, vi } from "vitest";

const getStudioEntryContextMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn(() => null));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));
vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() => Promise.resolve({ user: { id: "user-1" }, workspace: { id: "workspace-1" } })),
}));
vi.mock("@/lib/with-rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}));
vi.mock("@/server/application/get-studio-entry-context", () => ({
  getStudioEntryContext: (...args: unknown[]) => getStudioEntryContextMock(...args),
}));
vi.mock("@/server/studio-rollout", () => ({
  isStudioCarouselEnabled: vi.fn(() => false),
}));
vi.mock("@/server/validation/env", () => ({
  env: { STUDIO_CAROUSEL_ROLLOUT_PERCENT: 0 },
}));

import { GET } from "./route";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";

describe("GET /api/creative-work/entry-context", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when clientProfileId is not a uuid", async () => {
    const response = await GET(new Request("http://localhost/api/creative-work/entry-context?clientProfileId=bad"));
    expect(response.status).toBe(400);
    expect(getStudioEntryContextMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the profile is outside the workspace", async () => {
    getStudioEntryContextMock.mockResolvedValue({ ok: false, error: "profile_not_found" });
    const response = await GET(new Request(`http://localhost/api/creative-work/entry-context?clientProfileId=${PROFILE_ID}`));
    expect(response.status).toBe(404);
  });

  it("returns 200 with EntryContext on success", async () => {
    const context = {
      protocol: null,
      offer: null,
      audience: null,
      tone: null,
      protocolCandidates: [],
      offerCandidates: [],
      audienceCandidates: [],
      toneCandidates: [],
      workCount: 0,
    };
    getStudioEntryContextMock.mockResolvedValue({ ok: true, context });
    const response = await GET(new Request(`http://localhost/api/creative-work/entry-context?clientProfileId=${PROFILE_ID}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(context);
    expect(checkRateLimitMock).toHaveBeenCalledWith(expect.any(Request), { category: "read", workspaceId: "workspace-1" });
    expect(getStudioEntryContextMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      clientProfileId: PROFILE_ID,
      carouselEnabled: false,
    });
  });
});
