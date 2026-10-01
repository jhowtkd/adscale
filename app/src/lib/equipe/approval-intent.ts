// Approval intent in free text (pt-BR). Shared by the Equipe chat turn and by
// the suggestion filter, so what the server reads as an approval is never
// offered as a click. Pure on purpose: the filter also runs in the browser.

/** Lowercase, accent-free text for the pt-BR intent detectors. */
export function normalizeIntentText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const APPROVAL_PATTERNS = [
  /\bpode\s+(postar|publicar|subir|mandar|enviar)\b/,
  /\bpode\s+colocar\s+no\s+ar\b/,
  /\baprov(ad[oa]s?|o)\b/,
];

/**
 * Conservative approval-intent detector (pt-BR). A question mark ("posso
 * postar?") or a negation ("não pode postar") vetoes the match — when in
 * doubt the message goes to the strategist, never to a card.
 */
export function detectApprovalIntent(text: string): boolean {
  if (text.includes("?")) return false;
  const normalized = normalizeIntentText(text);
  if (/\bnao\b/.test(normalized)) return false;
  return APPROVAL_PATTERNS.some((pattern) => pattern.test(normalized));
}
