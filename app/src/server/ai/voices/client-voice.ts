import type { ClientVoice } from "./cenbrap";
import { CENBRAP_VOICE } from "./cenbrap";
import type { OlharVoiceConfigPayload } from "../../db/schema";
import { buildClientVoicePromptLines } from "./voice-prompt-section";

export type { ClientVoice } from "./cenbrap";
export { CENBRAP_VOICE } from "./cenbrap";
export { buildClientVoicePromptLines } from "./voice-prompt-section";

/** @deprecated Use resolveVoiceForClientProfile with clientProfileId — string matching is not used in generation. */
const REGISTERED_VOICES: readonly ClientVoice[] = [CENBRAP_VOICE];

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

export interface ClientVoiceLookupInput {
  name?: string | null;
  client?: string | null;
  product?: string | null;
}

function normalizeVoiceToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function matchesVoiceTerm(candidate: string, term: string): boolean {
  const normalizedCandidate = normalizeVoiceToken(candidate);
  const normalizedTerm = normalizeVoiceToken(term);

  if (normalizedCandidate.length === 0 || normalizedTerm.length === 0) {
    return false;
  }

  return (
    normalizedCandidate.includes(normalizedTerm) ||
    normalizedTerm.includes(normalizedCandidate)
  );
}

function voiceMatchesInput(voice: ClientVoice, input: ClientVoiceLookupInput): boolean {
  const candidates = [input.name, input.client, input.product].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );

  if (candidates.length === 0) {
    return false;
  }

  for (const candidate of candidates) {
    for (const term of voice.matchTerms) {
      if (matchesVoiceTerm(candidate, term)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * @deprecated Resolve voice by clientProfileId via resolveVoiceForClientProfile instead.
 * Kept for legacy unit tests only — not used in generation-direction or prompt-builder.
 */
export function resolveClientVoice(
  input: ClientVoiceLookupInput = {}
): ClientVoice | null {
  for (const voice of REGISTERED_VOICES) {
    if (voiceMatchesInput(voice, input)) {
      return voice;
    }
  }

  return null;
}

export function buildClientVoicePromptSection(voice: ClientVoice | null): string[] {
  if (!voice) {
    return [];
  }

  return voice.buildPromptSection();
}
