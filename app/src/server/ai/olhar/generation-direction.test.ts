import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  buildGenerationDirectionSection,
  extractPromptGenerationDirectionSection,
  GENERATION_DIRECTION_HEADER,
} from "./generation-direction";
import { CENBRAP_VOICE } from "../voices/cenbrap";
import { buildClientVoiceFromConfig } from "../voices/client-voice";
import { artVariationContractFixture } from "../prompt-builder.test-fixtures";

const resolveVoiceForClientProfile = vi.fn();
const resolveClientVoice = vi.fn();

vi.mock("../voices/voice-config-resolver", () => ({
  resolveVoiceForClientProfile: (...args: unknown[]) =>
    resolveVoiceForClientProfile(...args),
}));

vi.mock("../voices/client-voice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../voices/client-voice")>();
  return {
    ...actual,
    resolveClientVoice: (...args: unknown[]) => resolveClientVoice(...args),
  };
});

const cenbrapVoice = buildClientVoiceFromConfig({
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
});

describe("buildGenerationDirectionSection", () => {
  const baseInput = {
    contract: artVariationContractFixture(),
    campaign: {
      name: "CENBRAP NR1",
      client: "CENBRAP",
      product: "NR1 compliance toolkit",
      offer: "Conformidade NR1",
      constraints: "Preserve LGPD badge",
    },
    generationMode: "art_variation" as const,
    creativeLevel: "balanced",
    targetFormat: "1:1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resolveClientVoice.mockReturnValue(null);
    resolveVoiceForClientProfile.mockResolvedValue(null);
  });

  it("includes stable art-direction header and sacred facts", async () => {
    const section = (await buildGenerationDirectionSection(baseInput)).join("\n");

    expect(section).toContain(GENERATION_DIRECTION_HEADER);
    expect(section).toContain("Dominant idea");
    expect(section).toContain("Sacred facts");
    expect(section).toContain("CTA contract: Comprar agora");
    expect(section).toContain("Client / brand: Acme Corp");
    expect(section).toContain("Offer: Auditoria gratuita");
    expect(section).toContain("Allowed variation");
    expect(section).toContain("Creative level: balanced");
  });

  it("includes global Olhar anti-patterns and export second-pass reminder", async () => {
    const section = (await buildGenerationDirectionSection(baseInput)).join("\n");

    expect(section).toMatch(/anti-patterns/i);
    expect(section).toMatch(/generic ai template/i);
    expect(section).toMatch(/Exportacao reminder/i);
    expect(section).toMatch(/second pass/i);
  });

  it("uses base reading gestalt when provided", async () => {
    const section = (
      await buildGenerationDirectionSection({
        ...baseInput,
        baseReading: {
          dominantIdea: "Professor authority card",
          gestaltRead: "Vertical editorial stack with restrained proof",
          inviteWeight: "balanced",
          thumbnailRead: "Headline survives at 270px",
          brandPresence: "present",
          risks: ["Badge wall competes with hook"],
        },
      })
    ).join("\n");

    expect(section).toContain("Professor authority card");
    expect(section).toContain("Vertical editorial stack");
    expect(section).toContain("Badge wall competes with hook");
  });

  it("does not call legacy resolveClientVoice", async () => {
    await buildGenerationDirectionSection({
      ...baseInput,
      workspaceId: "ws-1",
      clientProfileId: "profile-cenbrap",
    });

    expect(resolveClientVoice).not.toHaveBeenCalled();
  });

  it("does not inject voice when campaign name matches Cenbrap but clientProfileId is absent", async () => {
    const section = (
      await buildGenerationDirectionSection({
        ...baseInput,
        campaign: {
          name: "CENBRAP NR1",
          client: "CENBRAP",
          product: "NR1",
          offer: "Conformidade NR1",
          constraints: null,
        },
        contract: artVariationContractFixture({
          client: "CENBRAP",
          product: "NR1",
          offer: "Conformidade NR1",
        }),
      })
    ).join("\n");

    expect(resolveVoiceForClientProfile).not.toHaveBeenCalled();
    expect(section).not.toContain("CLIENT VOICE — Cenbrap");
  });

  it("skips voice overlay when clientProfileId or workspaceId is missing without throwing", async () => {
    await expect(
      buildGenerationDirectionSection({
        ...baseInput,
        clientProfileId: "profile-cenbrap",
      })
    ).resolves.toBeDefined();

    await expect(
      buildGenerationDirectionSection({
        ...baseInput,
        workspaceId: "ws-1",
      })
    ).resolves.toBeDefined();

    expect(resolveVoiceForClientProfile).not.toHaveBeenCalled();
  });

  it("injects CLIENT VOICE when approved profile config resolves", async () => {
    resolveVoiceForClientProfile.mockResolvedValue({
      voice: cenbrapVoice,
      reviewStatus: "approved",
    });

    const section = (
      await buildGenerationDirectionSection({
        ...baseInput,
        workspaceId: "ws-1",
        clientProfileId: "profile-cenbrap",
        campaign: {
          name: "CENBRAP NR1",
          client: "CENBRAP",
          product: "NR1",
          offer: "Conformidade NR1",
          constraints: null,
        },
        contract: artVariationContractFixture({
          client: "CENBRAP",
          product: "NR1",
          offer: "Conformidade NR1",
        }),
      })
    ).join("\n");

    expect(resolveVoiceForClientProfile).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      clientProfileId: "profile-cenbrap",
    });
    expect(section).toContain("CLIENT VOICE — Cenbrap");
    expect(section).toMatch(/institutional|editorial/i);
  });

  it("does not inject voice when profile config is missing", async () => {
    resolveVoiceForClientProfile.mockResolvedValue(null);

    const section = (
      await buildGenerationDirectionSection({
        ...baseInput,
        workspaceId: "ws-1",
        clientProfileId: "unknown-profile",
      })
    ).join("\n");

    expect(section).not.toContain("CLIENT VOICE — Cenbrap");
  });

  it("does not inject voice when review is pending unless forceApproved", async () => {
    resolveVoiceForClientProfile.mockResolvedValue({
      voice: cenbrapVoice,
      reviewStatus: "pending_review",
    });

    const section = (
      await buildGenerationDirectionSection({
        ...baseInput,
        workspaceId: "ws-1",
        clientProfileId: "profile-cenbrap",
      })
    ).join("\n");

    expect(section).not.toContain("CLIENT VOICE — Cenbrap");
  });

  it("injects client voice when explicitly allowed via forceApproved", async () => {
    resolveVoiceForClientProfile.mockResolvedValue({
      voice: cenbrapVoice,
      reviewStatus: "pending_review",
    });

    const section = (
      await buildGenerationDirectionSection({
        ...baseInput,
        workspaceId: "ws-1",
        clientProfileId: "profile-cenbrap",
        allowClientVoice: true,
      })
    ).join("\n");

    expect(section).toContain("CLIENT VOICE — Cenbrap");
  });

  it("extractPromptGenerationDirectionSection returns block before MODE", async () => {
    const prompt = [
      "prefix",
      (await buildGenerationDirectionSection(baseInput)).join("\n"),
      "MODE: art_variation — test",
      "Campaign: test",
    ].join("\n");

    const extracted = extractPromptGenerationDirectionSection(prompt);
    expect(extracted).toContain(GENERATION_DIRECTION_HEADER);
    expect(extracted).not.toContain("MODE:");
  });
});
