import { canonicalJsonStringify } from "../creative-work/canonical-json";
import { colorDeltaE } from "../brand-training/measure-image";
import type { BrandKnowledgeClaim, BrandKnowledgeClaimKey } from "./contracts";

export type BrandKnowledgeComparison = "compatible" | "conflict" | "human_needed";

const normalize = (value: string) => value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
const normalizedSet = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === "string").map(normalize))].sort()
  : [];
const sameSet = (a: unknown, b: unknown) => canonicalJsonStringify(normalizedSet(a)) === canonicalJsonStringify(normalizedSet(b));
const fontIdentity = (value: unknown) => {
  if (!value || typeof value !== "object") return null;
  const font = value as { family?: unknown; weight?: unknown; style?: unknown };
  return typeof font.family === "string" && typeof font.weight === "number" && typeof font.style === "string"
    ? { family: normalize(font.family), weight: font.weight, style: normalize(font.style) }
    : null;
};

function compatiblePalettes(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const remaining = b.filter((color): color is string => typeof color === "string");
  return a.every((color) => {
    if (typeof color !== "string") return false;
    const index = remaining.findIndex((candidate) => {
      const distance = colorDeltaE(color, candidate);
      return distance !== null && distance <= 2.3;
    });
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
}

export function compareBrandKnowledgeValues(
  claimKey: BrandKnowledgeClaimKey,
  first: unknown,
  second: unknown,
): BrandKnowledgeComparison {
  if (claimKey === "palette.colors") return compatiblePalettes(first, second) ? "compatible" : "conflict";
  if (
    claimKey === "typography.families"
    || claimKey === "visual.required_elements"
    || claimKey === "visual.prohibited_elements"
  ) return sameSet(first, second) ? "compatible" : "conflict";
  if (claimKey === "typography.headline" || claimKey === "typography.body") {
    return canonicalJsonStringify(fontIdentity(first)) === canonicalJsonStringify(fontIdentity(second))
      ? "compatible"
      : "conflict";
  }
  if (claimKey === "logo.placement" || claimKey === "layout.hierarchy" || claimKey === "imagery.treatment" || claimKey === "graphic.treatment") {
    return canonicalJsonStringify(first) === canonicalJsonStringify(second) ? "compatible" : "human_needed";
  }
  if (claimKey === "visual.repertoire") {
    // One approved collection per scope: a differing second collection must
    // explicitly supersede the prior one instead of coexisting with it.
    return canonicalJsonStringify(first) === canonicalJsonStringify(second) ? "compatible" : "conflict";
  }
  return canonicalJsonStringify(first) === canonicalJsonStringify(second) ? "compatible" : "conflict";
}

export interface BrandKnowledgeConflict {
  claimKey: BrandKnowledgeClaimKey;
  scope: BrandKnowledgeClaim["scope"];
  comparison: Exclude<BrandKnowledgeComparison, "compatible">;
  claims: Array<Pick<BrandKnowledgeClaim, "id" | "value" | "authority" | "confidence" | "evidenceRefs">>;
}

export function findBrandKnowledgeConflicts(claims: readonly BrandKnowledgeClaim[]): BrandKnowledgeConflict[] {
  const groups = new Map<string, BrandKnowledgeClaim[]>();
  for (const claim of claims.filter((item) => item.status === "approved")) {
    const key = `${claim.claimKey}:${canonicalJsonStringify(claim.scope)}`;
    groups.set(key, [...(groups.get(key) ?? []), claim]);
  }
  return [...groups.values()].flatMap((group) => {
    if (group.length < 2) return [];
    const comparison = group.slice(1).reduce<BrandKnowledgeComparison>(
      (state, item) => state === "conflict"
        ? state
        : compareBrandKnowledgeValues(group[0]!.claimKey, group[0]!.value, item.value),
      "compatible",
    );
    if (comparison === "compatible") return [];
    return [{
      claimKey: group[0]!.claimKey,
      scope: group[0]!.scope,
      comparison,
      claims: group.map(({ id, value, authority, confidence, evidenceRefs }) => ({ id, value, authority, confidence, evidenceRefs })),
    }];
  });
}
