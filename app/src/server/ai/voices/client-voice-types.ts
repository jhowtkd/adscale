/**
 * Interface for a per-client voice configuration.
 *
 * This is the canonical location of the `ClientVoice` type. It intentionally
 * lives in its own module — independent of any single client's voice
 * implementation (e.g. CENBRAP) — so the voice type system is not anchored to
 * one pilot client's constant. Per-client voice constants (such as
 * `CENBRAP_VOICE` in `./cenbrap`) and runtime-built voices (such as those
 * produced by `buildClientVoiceFromConfig` in `./client-voice`) both implement
 * this interface.
 */
export interface ClientVoice {
  id: string;
  displayName: string;
  matchTerms: string[];
  principles: string[];
  positiveSignals: string[];
  negativeSignals: string[];
  authorityAndClaims: string[];
  inviteRhythm: string[];
  correctButSoulless: string[];
  buildPromptSection(): string[];
}
