import { ENTRY_PROTOCOLS, type EntryLocale, type EntryProtocol } from "./entry-types";

export const GENERIC_OFFER_IDS = ["launch", "capture", "immersion", "promo"] as const;
export const GENERIC_AUDIENCE_IDS = ["new", "returning", "companies"] as const;

export function genericProtocolIds(carouselEnabled: boolean): EntryProtocol[] {
  const base: EntryProtocol[] = ["single", "variations", "format_adaptation", "restyle"];
  return carouselEnabled ? [...base, "carousel"] : base;
}

export function isEntryProtocol(value: string): value is EntryProtocol {
  return (ENTRY_PROTOCOLS as readonly string[]).includes(value);
}

export function filterProtocols(
  values: string[],
  carouselEnabled: boolean,
): EntryProtocol[] {
  return values.filter((value): value is EntryProtocol => {
    if (value === "social_post") return false;
    if (value === "carousel" && !carouselEnabled) return false;
    return isEntryProtocol(value);
  });
}

const PROTOCOL_LABELS: Record<EntryLocale, Record<EntryProtocol, string>> = {
  "pt-BR": {
    single: "Peça única",
    variations: "Variações",
    format_adaptation: "Adaptar formatos",
    restyle: "Mudar estilo",
    carousel: "Carrossel",
  },
  en: {
    single: "Single piece",
    variations: "Variations",
    format_adaptation: "Adapt formats",
    restyle: "Restyle",
    carousel: "Carousel",
  },
};

const OFFER_LABELS: Record<EntryLocale, Record<(typeof GENERIC_OFFER_IDS)[number], string>> = {
  "pt-BR": {
    launch: "Lançamento",
    capture: "Captação",
    immersion: "Turma/imersão",
    promo: "Promoção",
  },
  en: {
    launch: "Launch",
    capture: "Lead gen",
    immersion: "Cohort / immersion",
    promo: "Promotion",
  },
};

const AUDIENCE_LABELS: Record<EntryLocale, Record<(typeof GENERIC_AUDIENCE_IDS)[number], string>> = {
  "pt-BR": {
    new: "Quem ainda não conhece",
    returning: "Quem já comprou",
    companies: "Empresas / times",
  },
  en: {
    new: "People who don't know you yet",
    returning: "Past buyers",
    companies: "Companies / teams",
  },
};

export function labelEntryValue(slot: "protocol" | "offer" | "audience" | "tone", value: string, locale: EntryLocale): string {
  if (slot === "protocol" && isEntryProtocol(value)) return PROTOCOL_LABELS[locale][value];
  if (slot === "offer" && value in OFFER_LABELS[locale]) {
    return OFFER_LABELS[locale][value as keyof typeof OFFER_LABELS["pt-BR"]];
  }
  if (slot === "audience" && value in AUDIENCE_LABELS[locale]) {
    return AUDIENCE_LABELS[locale][value as keyof typeof AUDIENCE_LABELS["pt-BR"]];
  }
  return value;
}
