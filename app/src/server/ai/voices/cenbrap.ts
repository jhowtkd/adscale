import type { ClientVoice } from "./client-voice-types";
import { buildClientVoicePromptLines } from "./voice-prompt-section";

export type { ClientVoice } from "./client-voice-types";

export const CENBRAP_VOICE: ClientVoice = {
  id: "cenbrap",
  displayName: "Cenbrap",
  matchTerms: ["cenbrap", "cenbrap em dobro", "imersao nr1", "nr1"],
  principles: [
    "Serious medical and professional education — authority through clarity, not growth-template gloss.",
    "Editorial hierarchy: the eye reads a confident headline, supporting proof, and a closing invite — not stacked UI modules.",
    "Human presence (professors, specialists, real people from source) reinforces trust when present in the brief or base creative.",
    "Restrained proof: one strong credential or claim beats a crowded badge wall.",
    "Typography and density feel institutional and readable — never neon startup or generic tech gradient by default.",
    "Principles guide judgment; they do not prescribe a single fixed layout template.",
  ],
  positiveSignals: [
    "Confident visual hierarchy with a clear dominant idea.",
    "Readable authority cues: institution name, specialty, or credential only when visible in source or brief.",
    "Human or professor presence when the source creative includes people — preserve likeness and role.",
    "Restrained proof blocks: one certification or MEC mention when briefed, not invented.",
    "Invite that closes the idea: the call-to-action completes the reading path instead of floating as a fake app button.",
    "Editorial rhythm: headline, supporting context, proof, invite — with intentional silence between groups.",
  ],
  negativeSignals: [
    "Neon glass morphism, smartphone mockup without source reason, generic tech gradient backgrounds.",
    "Crowded badge wall or certification strip invented from nothing.",
    "CTA styled as fake app download button when the source uses editorial invite text.",
    "Stock-medical mood detached from the actual brief, specialty, or people in the base creative.",
    "Growth-template gloss: dashboard cards, modular widget stacks, decorative gradients with no editorial intent.",
    "MedAula-style generic education template feel when Cenbrap should read as its own institutional voice.",
  ],
  authorityAndClaims: [
    "MEC recognition, certifications, and regulatory claims must appear only when visible in the base creative or explicitly briefed.",
    "Never invent authority: no fabricated seals, rankings, or certification badges.",
    "Preserve exact claim wording from source when claims are present — do not paraphrase into stronger language.",
    "Professor or specialist titles must match source; do not upgrade credentials.",
  ],
  inviteRhythm: [
    "The invite is the closing beat of the reading path — weight it after the dominant idea and proof.",
    "Prefer editorial call-to-action text over button-shaped widgets unless the source visibly uses a button.",
    "One clear invite per piece; avoid competing secondary CTAs that break hierarchy.",
    "Imperative or question tone should match the brief dialect — direct but not app-store aggressive.",
  ],
  correctButSoulless: [
    "All required text present, brand string correct, format valid — but composition reads like a generic education ad template.",
    "Legible headline and CTA with no factual errors — yet no dominant idea, no institutional presence, no Cenbrap editorial voice.",
    "Correct certification mention copied from brief — placed as a decorative badge strip instead of integrated authority.",
    "Professor photo present but cropped into a modular card grid with no gestalt or reading rhythm.",
  ],
  buildPromptSection(): string[] {
    return buildClientVoicePromptLines({
      displayName: this.displayName,
      principles: this.principles,
      positiveSignals: this.positiveSignals,
      negativeSignals: this.negativeSignals,
      authorityAndClaims: this.authorityAndClaims,
      inviteRhythm: this.inviteRhythm,
      correctButSoulless: this.correctButSoulless,
    });
  },
};
