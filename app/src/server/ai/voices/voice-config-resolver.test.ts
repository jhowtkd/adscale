import { beforeEach, describe, expect, it, vi } from "vitest";

import { CENBRAP_VOICE } from "./cenbrap";
import { buildClientVoiceFromConfig } from "./client-voice";

const getOlharVoiceConfigByClientProfileId = vi.fn();

vi.mock("@/server/repositories/client-profile-olhar-config", () => ({
  getOlharVoiceConfigByClientProfileId: (...args: unknown[]) =>
    getOlharVoiceConfigByClientProfileId(...args),
}));

import { resolveVoiceForClientProfile } from "./voice-config-resolver";

const cenbrapRow = {
  clientProfileId: "profile-cenbrap",
  workspaceId: "ws-1",
  voiceId: CENBRAP_VOICE.id,
  displayName: CENBRAP_VOICE.displayName,
  config: {
    principles: CENBRAP_VOICE.principles,
    positiveSignals: CENBRAP_VOICE.positiveSignals,
    negativeSignals: CENBRAP_VOICE.negativeSignals,
    authorityAndClaims: CENBRAP_VOICE.authorityAndClaims,
    inviteRhythm: CENBRAP_VOICE.inviteRhythm,
    correctButSoulless: CENBRAP_VOICE.correctButSoulless,
    matchTerms: CENBRAP_VOICE.matchTerms,
  },
  reviewStatus: "approved" as const,
  source: "seeded",
  approvedAt: new Date("2026-06-23T00:00:00.000Z"),
  approvedBy: null,
  createdAt: new Date("2026-06-23T00:00:00.000Z"),
  updatedAt: new Date("2026-06-23T00:00:00.000Z"),
};

describe("resolveVoiceForClientProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns voice and reviewStatus for approved Cenbrap profile config", async () => {
    getOlharVoiceConfigByClientProfileId.mockResolvedValue(cenbrapRow);

    const result = await resolveVoiceForClientProfile({
      workspaceId: "ws-1",
      clientProfileId: "profile-cenbrap",
    });

    expect(getOlharVoiceConfigByClientProfileId).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      clientProfileId: "profile-cenbrap",
    });
    expect(result).not.toBeNull();
    expect(result!.reviewStatus).toBe("approved");
    expect(result!.voice.buildPromptSection()).toEqual(
      buildClientVoiceFromConfig({
        voiceId: cenbrapRow.voiceId,
        displayName: cenbrapRow.displayName,
        config: cenbrapRow.config,
      }).buildPromptSection()
    );
    expect(result!.voice.buildPromptSection().join("\n")).toContain(
      "CLIENT VOICE — Cenbrap"
    );
  });

  it("returns null when no config exists for profile", async () => {
    getOlharVoiceConfigByClientProfileId.mockResolvedValue(null);

    const result = await resolveVoiceForClientProfile({
      workspaceId: "ws-1",
      clientProfileId: "unknown-profile",
    });

    expect(result).toBeNull();
  });
});
