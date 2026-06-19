import type { ClientVoice } from "./cenbrap";
import { CENBRAP_VOICE } from "./cenbrap";

export type { ClientVoice } from "./cenbrap";
export { CENBRAP_VOICE } from "./cenbrap";

const REGISTERED_VOICES: readonly ClientVoice[] = [CENBRAP_VOICE];

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
