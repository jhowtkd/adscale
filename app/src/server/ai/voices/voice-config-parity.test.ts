import { describe, expect, it } from "vitest";

import { CENBRAP_VOICE } from "./cenbrap";
import { buildClientVoiceFromConfig } from "./client-voice";

function cenbrapConfigFixture() {
  return {
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
  };
}

describe("voice config parity", () => {
  it("DB-shaped Cenbrap config produces identical prompt section to CENBRAP_VOICE", () => {
    const fromConfig = buildClientVoiceFromConfig(cenbrapConfigFixture());

    expect(fromConfig.buildPromptSection()).toEqual(CENBRAP_VOICE.buildPromptSection());
  });

  it("prompt section is non-empty and stable across reconstruction", () => {
    const fromConfig = buildClientVoiceFromConfig(cenbrapConfigFixture());
    const hardcoded = CENBRAP_VOICE.buildPromptSection();
    const reconstructed = fromConfig.buildPromptSection();

    expect(reconstructed.length).toBeGreaterThan(20);
    expect(reconstructed).toEqual(hardcoded);
  });
});
