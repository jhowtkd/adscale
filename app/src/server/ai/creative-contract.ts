export type CtaSemantics =
  | { kind: "explicit"; text: string }
  | { kind: "inherited" }
  | { kind: "absent" };

export interface CreativeContract {
  generationMode: "art_variation" | "format_adaptation" | "restyling";
  targetFormat: string;
  ctaSemantics: CtaSemantics;
  baseAssetId: string | null;
  styleAssetId: string | null;
  client: string | null;
  product: string | null;
  offer: string | null;
  constraints: string | null;
}

/**
 * Resolves CTA text to a CtaSemantics discriminated union.
 * - Non-empty string → explicit with that text
 * - null, undefined, or empty string → inherited (base CTA preserved; absent not surfaced in v11.1)
 */
export function resolveCtaSemantics(
  ctaText: string | null | undefined,
  _mode: CreativeContract["generationMode"]
): CtaSemantics {
  if (ctaText && ctaText.trim().length > 0) {
    return { kind: "explicit", text: ctaText };
  }
  return { kind: "inherited" };
}
