import type { ClientVoice } from "./client-voice-types";
import { CENBRAP_VOICE } from "./cenbrap";
import type { OlharVoiceConfigPayload } from "../../db/schema";
import { buildClientVoicePromptLines } from "./voice-prompt-section";

export type { ClientVoice } from "./client-voice-types";
export { CENBRAP_VOICE } from "./cenbrap";
export { buildClientVoicePromptLines } from "./voice-prompt-section";

export interface OlharVoiceConfigRowInput {
  voiceId: string;
  displayName: string;
  config: OlharVoiceConfigPayload;
}

export function buildClientVoiceFromConfig(row: OlharVoiceConfigRowInput): ClientVoice {
  const { voiceId, displayName, config } = row;

  return {
    id: voiceId,
    displayName,
    matchTerms: config.matchTerms ?? [],
    principles: config.principles,
    positiveSignals: config.positiveSignals,
    negativeSignals: config.negativeSignals,
    authorityAndClaims: config.authorityAndClaims,
    inviteRhythm: config.inviteRhythm,
    correctButSoulless: config.correctButSoulless,
    buildPromptSection(): string[] {
      return buildClientVoicePromptLines({
        displayName,
        principles: config.principles,
        positiveSignals: config.positiveSignals,
        negativeSignals: config.negativeSignals,
        authorityAndClaims: config.authorityAndClaims,
        inviteRhythm: config.inviteRhythm,
        correctButSoulless: config.correctButSoulless,
      });
    },
  };
}

export function buildClientVoicePromptSection(voice: ClientVoice | null): string[] {
  if (!voice) {
    return [];
  }

  return voice.buildPromptSection();
}