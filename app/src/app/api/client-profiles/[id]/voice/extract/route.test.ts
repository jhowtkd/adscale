import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const PROFILE_ID = "a8ff76d8-0f93-4563-b991-389e03049846";
const WORKSPACE_ID = "workspace-1";

const mocks = vi.hoisted(() => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: WORKSPACE_ID },
    }),
  ),
  checkRateLimit: vi.fn(() => Promise.resolve(null)),
  spendOrApiError: vi.fn(() => Promise.resolve(null)),
  getClientProfile: vi.fn(),
  getBrandKit: vi.fn(),
  getClientReferences: vi.fn(),
  getApprovedTrainingReferences: vi.fn(),
  extractVoiceFromBrandInputs: vi.fn(),
  toOlharVoiceConfigPayload: vi.fn((v: unknown) => ({ ...(v as object), matchTerms: [] })),
  upsertOlharVoiceConfig: vi.fn(),
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: mocks.requireWorkspaceAccess,
}));
vi.mock("@/lib/with-rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock("@/server/billing/paywall", () => ({
  spendOrApiError: mocks.spendOrApiError,
}));
vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: (...args: unknown[]) => mocks.getClientProfile(...args),
  getClientReferences: (...args: unknown[]) => mocks.getClientReferences(...args),
  getApprovedTrainingReferences: (...args: unknown[]) =>
    mocks.getApprovedTrainingReferences(...args),
}));
vi.mock("@/server/repositories/brand-kit", () => ({
  getBrandKit: (...args: unknown[]) => mocks.getBrandKit(...args),
}));
vi.mock("@/server/ai/voices/voice-extractor", () => ({
  extractVoiceFromBrandInputs: (...args: unknown[]) =>
    mocks.extractVoiceFromBrandInputs(...args),
  toOlharVoiceConfigPayload: (...args: unknown[]) =>
    mocks.toOlharVoiceConfigPayload(...args),
}));
vi.mock("@/server/repositories/client-profile-olhar-config", () => ({
  upsertOlharVoiceConfig: (...args: unknown[]) => mocks.upsertOlharVoiceConfig(...args),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: mocks.getTranslations,
}));

function postRequest(body: unknown = {}) {
  return new Request(
    `http://localhost/api/client-profiles/${PROFILE_ID}/voice/extract`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/client-profiles/[id]/voice/extract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClientProfile.mockResolvedValue({ id: PROFILE_ID, name: "CENBRAP" });
    mocks.getBrandKit.mockResolvedValue(null);
    mocks.getClientReferences.mockResolvedValue([]);
    mocks.getApprovedTrainingReferences.mockResolvedValue([]);
    mocks.extractVoiceFromBrandInputs.mockResolvedValue({
      principles: ["Clear"],
      positiveSignals: ["Direct"],
      negativeSignals: ["Hype"],
      authorityAndClaims: ["No invented credentials"],
      inviteRhythm: ["Soft close"],
      correctButSoulless: ["Generic template"],
    });
    mocks.upsertOlharVoiceConfig.mockResolvedValue({
      clientProfileId: PROFILE_ID,
      reviewStatus: "pending_review",
    });
  });

  it("returns 400 when there is no textual brand input", async () => {
    const res = await POST(postRequest({}), {
      params: Promise.resolve({ id: PROFILE_ID }),
    });
    expect(res.status).toBe(400);
    expect(mocks.spendOrApiError).not.toHaveBeenCalled();
    expect(mocks.extractVoiceFromBrandInputs).not.toHaveBeenCalled();
  });

  it("uses approved training analysis descriptions as creative input", async () => {
    mocks.getApprovedTrainingReferences.mockResolvedValue([
      {
        id: "ref-1",
        label: "page-07.jpg",
        trainingAnalysis: { description: "Coordenador com fundo verde." },
      },
    ]);

    const res = await POST(postRequest({}), {
      params: Promise.resolve({ id: PROFILE_ID }),
    });

    expect(res.status).toBe(201);
    expect(mocks.extractVoiceFromBrandInputs).toHaveBeenCalledWith(
      expect.objectContaining({
        creativeDescriptions: ["Coordenador com fundo verde."],
      }),
    );
  });

  it("uses brand kit tone when no references exist", async () => {
    mocks.getBrandKit.mockResolvedValue({
      toneOfVoice: "Técnico e acolhedor",
    });

    const res = await POST(postRequest({}), {
      params: Promise.resolve({ id: PROFILE_ID }),
    });

    expect(res.status).toBe(201);
    expect(mocks.extractVoiceFromBrandInputs).toHaveBeenCalledWith(
      expect.objectContaining({
        toneOfVoice: "Técnico e acolhedor",
      }),
    );
  });
});
