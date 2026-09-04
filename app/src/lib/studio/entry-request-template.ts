import { labelEntryValue } from "./entry-catalog";
import type { EntryFacts, EntryLocale } from "./entry-types";

export function formatEntryRequestTemplate(facts: EntryFacts, locale: EntryLocale): string {
  const protocol = facts.protocol ? labelEntryValue("protocol", facts.protocol, locale) : "";
  const offer = facts.offer ? labelEntryValue("offer", facts.offer, locale) : "";
  const audience = facts.audience ? labelEntryValue("audience", facts.audience, locale) : "";
  const tone = facts.tone ? labelEntryValue("tone", facts.tone, locale) : "";
  if (!protocol && !offer && !audience && !tone) return "";
  const head = protocol || (locale === "en" ? "Piece" : "Peça");
  const offerPart = offer ? (locale === "en" ? ` for ${offer}` : ` de ${offer}`) : "";
  const audiencePart = audience ? (locale === "en" ? ` to ${audience}` : ` para ${audience}`) : "";
  const tonePart = tone ? (locale === "en" ? `, ${tone} tone` : `, tom ${tone}`) : "";
  return `${head}${offerPart}${audiencePart}${tonePart}.`;
}
