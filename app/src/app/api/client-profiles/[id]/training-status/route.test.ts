import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const PROFILE_ID = "550e8400-e29b-41d4-a716-446655440000";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    }),
  ),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const getClientProfile = vi.fn();
const getClientReferences = vi.fn();
vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: (...args: unknown[]) => getClientProfile(...args),
  getClientReferences: (...args: unknown[]) => getClientReferences(...args),
}));

const getBrandKit = vi.fn();
vi.mock("@/server/repositories/brand-kit", () => ({
  getBrandKit: (...args: unknown[]) => getBrandKit(...args),
}));

const getOlharVoiceConfigByClientProfileId = vi.fn();
vi.mock("@/server/repositories/client-profile-olhar-config", () => ({
  getOlharVoiceConfigByClientProfileId: (...args: unknown[]) =>
    getOlharVoiceConfigByClientProfileId(...args),
}));

const listBrandKnowledgeClaims = vi.fn();
vi.mock("@/server/repositories/brand-knowledge", () => ({
  listBrandKnowledgeClaims: (...args: unknown[]) => listBrandKnowledgeClaims(...args),
}));

const getTrainingSession = vi.fn();
vi.mock("@/server/repositories/brand-training-sessions", () => ({
  getTrainingSession: (...args: unknown[]) => getTrainingSession(...args),
}));

function mockProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: PROFILE_ID,
    name: "Acme",
    ...overrides,
  };
}

describe("GET /api/client-profiles/[id]/training-status", () => {
  beforeEach(() => {
    getClientProfile.mockReset();
    getClientReferences.mockReset();
    getBrandKit.mockReset();
    getOlharVoiceConfigByClientProfileId.mockReset();
    listBrandKnowledgeClaims.mockReset();
    getTrainingSession.mockReset();
    listBrandKnowledgeClaims.mockResolvedValue([]);
    getTrainingSession.mockResolvedValue(null);
  });

  it("returns 404 when the profile does not exist", async () => {
    getClientProfile.mockResolvedValue(null);

    const res = await GET(
      new Request(`http://localhost/api/client-profiles/${PROFILE_ID}/training-status`),
      { params: Promise.resolve({ id: PROFILE_ID }) },
    );

    expect(res.status).toBe(404);
  });

  it("reports trained=false with both gaps when the profile is empty", async () => {
    getClientProfile.mockResolvedValue(mockProfile());
    getBrandKit.mockResolvedValue({ logoAssetKey: null, brandColors: null, brandFonts: null });
    getClientReferences.mockResolvedValue([]);
    getOlharVoiceConfigByClientProfileId.mockResolvedValue(null);

    const res = await GET(
      new Request(`http://localhost/api/client-profiles/${PROFILE_ID}/training-status`),
      { params: Promise.resolve({ id: PROFILE_ID }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      profile: { id: PROFILE_ID, name: "Acme" },
      trained: false,
      missing: ["logo", "visual-signal"],
      needsReview: false,
      voice: { configured: false, reviewStatus: null },
      calibration: null,
    });
  });

  it("reports trained=true when logo + a style reference are present", async () => {
    getClientProfile.mockResolvedValue(mockProfile());
    getBrandKit.mockResolvedValue({ logoAssetKey: "ws/logo.png", brandColors: null, brandFonts: null });
    getClientReferences.mockResolvedValue([{ kind: "style" }]);
    getOlharVoiceConfigByClientProfileId.mockResolvedValue(null);

    const res = await GET(
      new Request(`http://localhost/api/client-profiles/${PROFILE_ID}/training-status`),
      { params: Promise.resolve({ id: PROFILE_ID }) },
    );

    const body = await res.json();
    expect(body.trained).toBe(true);
    expect(body.missing).toEqual([]);
  });

  it("surfaces the voice review status when a voice config exists", async () => {
    getClientProfile.mockResolvedValue(mockProfile());
    getBrandKit.mockResolvedValue({
      logoAssetKey: "ws/logo.png",
      brandColors: ["#000000"],
      brandFonts: ["Inter"],
    });
    getClientReferences.mockResolvedValue([]);
    getOlharVoiceConfigByClientProfileId.mockResolvedValue({ reviewStatus: "pending_review" });

    const res = await GET(
      new Request(`http://localhost/api/client-profiles/${PROFILE_ID}/training-status`),
      { params: Promise.resolve({ id: PROFILE_ID }) },
    );

    const body = await res.json();
    expect(body.trained).toBe(true);
    expect(body.needsReview).toBe(true);
    expect(body.voice).toEqual({ configured: true, reviewStatus: "pending_review" });
  });

  it("reports pending asset approvals as needing review", async () => {
    getClientProfile.mockResolvedValue(mockProfile());
    getBrandKit.mockResolvedValue({ logoAssetKey: "ws/logo.png", brandColors: null, brandFonts: null });
    getClientReferences.mockResolvedValue([
      { kind: "style", trainingCategory: "visual_reference", reviewStatus: "pending_approval" },
    ]);
    getOlharVoiceConfigByClientProfileId.mockResolvedValue(null);

    const res = await GET(
      new Request(`http://localhost/api/client-profiles/${PROFILE_ID}/training-status`),
      { params: Promise.resolve({ id: PROFILE_ID }) },
    );

    expect((await res.json()).needsReview).toBe(true);
  });

  it("reports pending font approvals as needing review", async () => {
    getClientProfile.mockResolvedValue(mockProfile({
      brandFontAssets: [{ reviewStatus: "pending_approval" }],
    }));
    getBrandKit.mockResolvedValue({ logoAssetKey: "ws/logo.png", brandColors: null, brandFonts: null });
    getClientReferences.mockResolvedValue([]);
    getOlharVoiceConfigByClientProfileId.mockResolvedValue(null);

    const res = await GET(
      new Request(`http://localhost/api/client-profiles/${PROFILE_ID}/training-status`),
      { params: Promise.resolve({ id: PROFILE_ID }) },
    );

    expect((await res.json()).needsReview).toBe(true);
  });

  it("reports candidate knowledge claims as needing review", async () => {
    getClientProfile.mockResolvedValue(mockProfile());
    getBrandKit.mockResolvedValue({ logoAssetKey: "ws/logo.png", brandColors: null, brandFonts: null });
    getClientReferences.mockResolvedValue([]);
    getOlharVoiceConfigByClientProfileId.mockResolvedValue(null);
    listBrandKnowledgeClaims.mockResolvedValue([{ status: "candidate" }]);

    const res = await GET(
      new Request(`http://localhost/api/client-profiles/${PROFILE_ID}/training-status`),
      { params: Promise.resolve({ id: PROFILE_ID }) },
    );

    expect((await res.json()).needsReview).toBe(true);
  });

  it("ignores pending_analysis trained references when computing readiness", async () => {
    // Pending-analysis assets must NOT satisfy the visual-signal gate,
    // otherwise the wizard would mark a brand trained before the LLM has
    // even looked at the image.
    getClientProfile.mockResolvedValue(mockProfile());
    getBrandKit.mockResolvedValue({ logoAssetKey: "ws/logo.png", brandColors: null, brandFonts: null });
    getClientReferences.mockResolvedValue([
      {
        kind: "style",
        trainingCategory: "visual_reference",
        reviewStatus: "pending_analysis",
      },
    ]);
    getOlharVoiceConfigByClientProfileId.mockResolvedValue(null);

    const res = await GET(
      new Request(`http://localhost/api/client-profiles/${PROFILE_ID}/training-status`),
      { params: Promise.resolve({ id: PROFILE_ID }) },
    );

    const body = await res.json();
    expect(body.trained).toBe(false);
    expect(body.missing).toEqual(["visual-signal"]);
  });

  it("an approved trained logo satisfies the logo gate without a legacy logoAssetKey", async () => {
    // The route must forward trainingCategory and reviewStatus so the
    // readiness resolver can accept an approved logo as the logo source.
    getClientProfile.mockResolvedValue(mockProfile());
    getBrandKit.mockResolvedValue({ logoAssetKey: null, brandColors: null, brandFonts: null });
    getClientReferences.mockResolvedValue([
      {
        kind: "other",
        trainingCategory: "logo",
        reviewStatus: "approved",
      },
    ]);
    getOlharVoiceConfigByClientProfileId.mockResolvedValue(null);

    const res = await GET(
      new Request(`http://localhost/api/client-profiles/${PROFILE_ID}/training-status`),
      { params: Promise.resolve({ id: PROFILE_ID }) },
    );

    const body = await res.json();
    // The logo gap is closed by the approved trained logo reference; the
    // visual-signal gap remains because no visual evidence has been
    // approved yet.
    expect(body.missing).toEqual(["visual-signal"]);
    expect(body.trained).toBe(false);
  });

  it("distinguishes pending calibration from active training (plan 01, T3)", async () => {
    getClientProfile.mockResolvedValue(mockProfile());
    getBrandKit.mockResolvedValue({ logoAssetKey: null, brandColors: null, brandFonts: null });
    getClientReferences.mockResolvedValue([]);
    getOlharVoiceConfigByClientProfileId.mockResolvedValue(null);
    getTrainingSession.mockResolvedValue({
      id: "session-1",
      status: "calibrating",
      rounds: [{ number: 1 }, { number: 2 }],
      extensionCount: 0,
    });

    const res = await GET(
      new Request(`http://localhost/api/client-profiles/${PROFILE_ID}/training-status`),
      { params: Promise.resolve({ id: PROFILE_ID }) },
    );

    const body = await res.json();
    expect(body.calibration).toEqual({
      sessionId: "session-1",
      status: "calibrating",
      round: 2,
      roundsCompleted: 2,
      extensionCount: 0,
    });
  });

  it("reports no calibration session when none is open", async () => {
    getClientProfile.mockResolvedValue(mockProfile());
    getBrandKit.mockResolvedValue({ logoAssetKey: null, brandColors: null, brandFonts: null });
    getClientReferences.mockResolvedValue([]);
    getOlharVoiceConfigByClientProfileId.mockResolvedValue(null);

    const res = await GET(
      new Request(`http://localhost/api/client-profiles/${PROFILE_ID}/training-status`),
      { params: Promise.resolve({ id: PROFILE_ID }) },
    );

    expect((await res.json()).calibration).toBeNull();
  });
});
