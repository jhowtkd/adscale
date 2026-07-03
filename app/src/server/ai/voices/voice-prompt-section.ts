export interface ClientVoicePromptFields {
  displayName: string;
  principles: string[];
  positiveSignals: string[];
  negativeSignals: string[];
  authorityAndClaims: string[];
  inviteRhythm: string[];
  correctButSoulless: string[];
}

export function buildClientVoicePromptLines(fields: ClientVoicePromptFields): string[] {
  return [
    `CLIENT VOICE — ${fields.displayName} (overlay on Olhar ADScale):`,
    "- This voice describes what feels on-brand and what is off-brand for this client. It does not replace global Olhar principles or export compliance.",
    "",
    "Principles:",
    ...fields.principles.map((p) => `- ${p}`),
    "",
    "Positive signals (seek these):",
    ...fields.positiveSignals.map((s) => `- ${s}`),
    "",
    "Negative signals (reject these):",
    ...fields.negativeSignals.map((s) => `- ${s}`),
    "",
    "Authority and claims:",
    ...fields.authorityAndClaims.map((a) => `- ${a}`),
    "",
    "Invite rhythm:",
    ...fields.inviteRhythm.map((r) => `- ${r}`),
    "",
    "Correct but soulless (fail Olhar even when export-clean):",
    ...fields.correctButSoulless.map((e) => `- ${e}`),
    "",
    "Anti-template: reject generic AI education aesthetics. Do not default to neon, glass, smartphone mockups, or widget-card layouts.",
    "No fixed layout prescription — apply principles to each piece's dominant idea, gestalt, and reading path.",
  ];
}
