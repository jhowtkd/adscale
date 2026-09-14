import { z } from "zod";

import type {
  CreativeWorkReferencePlanAsset,
  CreativeWorkReferenceSlot,
} from "../creative-work/reference-plan";

/**
 * Named brand people (plan 03, T1). A person is an operator-assigned record:
 * the system never identifies strangers, never infers names and never merges
 * lookalikes. Photos are training references grouped by the operator; only
 * identifiers, the primary reference and operator guidance are stored.
 */

export const BRAND_PERSON_PRESERVE_LIMIT = 12;
export const BRAND_PERSON_PRESERVE_LENGTH = 240;
export const BRAND_PERSON_ALIASES_LIMIT = 10;
export const BRAND_PERSON_ALIAS_LENGTH = 100;
export const BRAND_PERSON_REFERENCES_LIMIT = 12;
export const BRAND_PERSON_CATALOG_LIMIT = 50;

export const brandPersonSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    aliases: z.array(z.string().trim().min(1).max(BRAND_PERSON_ALIAS_LENGTH)).max(BRAND_PERSON_ALIASES_LIMIT),
    referenceIds: z
      .array(z.string().uuid())
      .min(1)
      .max(BRAND_PERSON_REFERENCES_LIMIT),
    primaryReferenceId: z.string().uuid(),
    preserve: z.array(z.string().trim().min(1).max(BRAND_PERSON_PRESERVE_LENGTH)).max(BRAND_PERSON_PRESERVE_LIMIT),
    referenceAdequacy: z.enum(["confirmed", "needs_more_photos"]),
  })
  .strict()
  .superRefine((person, context) => {
    if (new Set(person.referenceIds).size !== person.referenceIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["referenceIds"],
        message: "referenceIdsMustBeUnique",
      });
    }
    if (!person.referenceIds.includes(person.primaryReferenceId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["primaryReferenceId"],
        message: "primaryReferenceMustBelongToPerson",
      });
    }
  });

export type BrandPerson = z.infer<typeof brandPersonSchema>;

export const peopleCatalogSchema = z
  .object({
    version: z.literal(1),
    people: z.array(brandPersonSchema).max(BRAND_PERSON_CATALOG_LIMIT),
  })
  .strict()
  .superRefine((catalog, context) => {
    const ids = catalog.people.map((person) => person.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["people"],
        message: "personIdsMustBeUnique",
      });
    }
    // Same photo cannot belong to two people without an explicit per-person
    // confirmation; this delivery requires individual photos/crops only.
    const seen = new Map<string, string>();
    for (const person of catalog.people) {
      for (const referenceId of person.referenceIds) {
        const owner = seen.get(referenceId);
        if (owner && owner !== person.id) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["people"],
            message: "referenceSharedAcrossPeople",
          });
          return;
        }
        seen.set(referenceId, person.id);
      }
    }
  });

export type PeopleCatalog = z.infer<typeof peopleCatalogSchema>;

/** Extractor version stamped on compiled `people.catalog` candidates. */
export const PEOPLE_CATALOG_EXTRACTOR_VERSION = "people-catalog-v1";

export type PersonMentionResolution =
  | { kind: "resolved"; person: BrandPerson }
  | { kind: "ambiguous"; ids: string[] }
  | { kind: "missing" };

const normalizePersonName = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase("pt-BR");

export function resolvePersonMention(
  name: string,
  people: readonly BrandPerson[],
): PersonMentionResolution {
  const wanted = normalizePersonName(name);
  const matches = people.filter((person) =>
    [person.name, ...person.aliases].some(
      (candidate) => normalizePersonName(candidate) === wanted,
    ),
  );
  if (matches.length === 0) return { kind: "missing" as const };
  if (matches.length > 1) {
    return { kind: "ambiguous" as const, ids: matches.map((person) => person.id) };
  }
  return { kind: "resolved" as const, person: matches[0]! };
}

/**
 * Mandatory provider reference slots for named people (plan 03, T2). Reuses
 * the existing `piece_required` role — no new role enum — with the frozen
 * `person_or_character` / `identity_preservation` contract. The primary photo
 * is the identity proof; secondary photos only fill free slots in catalog
 * order (handled by the caller via `secondaryPersonReferenceAssets`).
 *
 * Throws `person_reference_required` when the primary photo is unavailable or
 * the operator has not confirmed adequacy: an unconfirmed person never
 * generates silently.
 */
export function personReferenceSlots(
  people: readonly BrandPerson[],
  assetsByReferenceId: ReadonlyMap<string, CreativeWorkReferencePlanAsset>,
): CreativeWorkReferenceSlot[] {
  return people.map((person) => {
    const asset = assetsByReferenceId.get(person.primaryReferenceId);
    if (!asset || person.referenceAdequacy !== "confirmed") {
      throw new Error("person_reference_required");
    }
    const guidance = person.preserve.length > 0 ? ` ${person.preserve.join("; ")}` : "";
    return {
      ...asset,
      label: person.name,
      role: "piece_required" as const,
      required: true,
      pieceReference: {
        category: "person_or_character" as const,
        treatment: "identity_preservation" as const,
        userInstruction: `Pessoa ${person.name}. Preservar identidade e anatomia.${guidance}`,
      },
    };
  });
}

export type PersonOption = { id: string; name: string };

/**
 * Frozen snapshot people mentioned in a slide's own frozen copy (plan 03,
 * T2). Snapshot people are already disambiguated IDs, so every name match is
 * a required presence for that slide — no clarification round-trip.
 */
export function snapshotPeopleMentionedInText<
  T extends { name: string },
>(text: string, people: readonly T[]): T[] {
  if (!text.trim() || people.length === 0) return [];
  const normalizedText = text.normalize("NFKC").toLocaleLowerCase("pt-BR");
  return people.filter((person) => mentionsName(normalizedText, person.name));
}

export type BriefingPeopleError =
  | { code: "person_unknown"; personId: string; options: PersonOption[] }
  | { code: "person_ambiguous"; name: string; options: PersonOption[] }
  | { code: "person_unconfirmed"; personId: string; name: string }
  | { code: "person_limit"; limit: number; requested: number };

export type BriefingPeopleResolution =
  | { ok: true; people: BrandPerson[] }
  | { ok: false; error: BriefingPeopleError };

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Word-boundary match on normalized text; multi-word names supported. */
function mentionsName(text: string, name: string): boolean {
  const wanted = normalizePersonName(name);
  if (!wanted) return false;
  const boundary = "[\\p{L}\\p{Nd}_\\p{M}]";
  return new RegExp(
    `(?<!${boundary})${escapeRegExp(wanted)}(?!${boundary})`,
    "iu",
  ).test(text.normalize("NFKC"));
}

/**
 * Resolve briefing people against the frozen catalog (plan 03, T2). Explicit
 * IDs win over names; unknown/ambiguous mentions block preparation with a
 * clarification payload carrying catalog options. Names listed in `textOnly`
 * stay textual even when they appear in the briefing.
 */
export function resolveBriefingPeople(input: {
  catalog: PeopleCatalog | null;
  personIds?: readonly string[];
  text: string;
  textOnly?: readonly string[];
}): BriefingPeopleResolution {
  const catalog = input.catalog;
  const explicitIds = [...new Set(input.personIds ?? [])];
  const textOnly = new Set((input.textOnly ?? []).map(normalizePersonName));
  const options: PersonOption[] = (catalog?.people ?? []).map((person) => ({ id: person.id, name: person.name }));

  if (!catalog || catalog.people.length === 0) {
    if (explicitIds.length > 0) {
      return { ok: false, error: { code: "person_unknown", personId: explicitIds[0]!, options } };
    }
    return { ok: true, people: [] };
  }

  const byId = new Map(catalog.people.map((person) => [person.id, person]));
  const resolved: BrandPerson[] = [];
  for (const personId of explicitIds) {
    const person = byId.get(personId);
    if (!person) {
      return { ok: false, error: { code: "person_unknown", personId, options } };
    }
    if (person.referenceAdequacy !== "confirmed") {
      return { ok: false, error: { code: "person_unconfirmed", personId, name: person.name } };
    }
    resolved.push(person);
  }

  // Briefing mentions: every catalog name/alias found in the text becomes a
  // required presence — unless listed as text-only or covered by explicit IDs.
  const seen = new Set(resolved.map((person) => person.id));
  const normalizedText = input.text.normalize("NFKC").toLocaleLowerCase("pt-BR");
  for (const person of catalog.people) {
    if (seen.has(person.id)) continue;
    const matched = [person.name, ...person.aliases]
      .filter((candidate) => !textOnly.has(normalizePersonName(candidate)))
      .find((candidate) => mentionsName(normalizedText, candidate));
    if (!matched) continue;
    const resolution = resolvePersonMention(matched, catalog.people);
    if (resolution.kind === "ambiguous") {
      // Explicit IDs win: an ambiguous name is skipped when the operator
      // already chose IDs; otherwise preparation asks for clarification.
      if (explicitIds.length > 0) continue;
      return {
        ok: false,
        error: {
          code: "person_ambiguous",
          name: matched,
          options: options.filter((option) => resolution.ids.includes(option.id)),
        },
      };
    }
    if (resolution.kind === "missing") continue;
    if (resolution.person.referenceAdequacy !== "confirmed") {
      return {
        ok: false,
        error: { code: "person_unconfirmed", personId: resolution.person.id, name: resolution.person.name },
      };
    }
    if (!seen.has(resolution.person.id)) {
      seen.add(resolution.person.id);
      resolved.push(resolution.person);
    }
  }

  if (resolved.length > 3) {
    return { ok: false, error: { code: "person_limit", limit: 3, requested: resolved.length } };
  }
  return { ok: true, people: resolved };
}

/**
 * Secondary photos of one person, in catalog order, for free slots only.
 * Never evicts a mandatory slot; the caller enforces the provider cap.
 */
export function secondaryPersonReferenceAssets(
  person: BrandPerson,
  assetsByReferenceId: ReadonlyMap<string, CreativeWorkReferencePlanAsset>,
): CreativeWorkReferencePlanAsset[] {
  if (person.referenceAdequacy !== "confirmed") return [];
  return person.referenceIds
    .filter((referenceId) => referenceId !== person.primaryReferenceId)
    .flatMap((referenceId) => {
      const asset = assetsByReferenceId.get(referenceId);
      return asset ? [{ ...asset, label: person.name }] : [];
    });
}
