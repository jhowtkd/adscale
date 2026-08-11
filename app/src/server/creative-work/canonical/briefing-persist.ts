/**
 * Phase 5 / item 36: CanonicalBriefing write → SocialPost brief/copy JSONB.
 * Storage stays brief + copy columns; application commands speak CanonicalBriefing.
 */
import type { CanonicalBriefing } from "@/server/creative-work/canonical/types";
import {
  socialPostBriefSchema,
  socialPostCopySchema,
  type SocialPostBrief,
  type SocialPostCopy,
} from "@/server/creative-work/contracts";

/**
 * Partial canonical briefing write. `objective` lives on CanonicalIntent
 * (not CanonicalBriefing) but must land on SocialPostBrief.objective.
 */
export type CanonicalBriefingWrite = Partial<CanonicalBriefing> & {
  objective?: string | null;
};

function nonEmpty(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : fallback;
}

function nullable(value: string | null | undefined, fallback: string | null | undefined): string | null {
  return (value === undefined ? fallback : value)?.trim() || null;
}

/** Map canonical briefing (+ intent objective) → SocialPostBrief JSONB. */
export function toSocialPostBrief(
  write: CanonicalBriefingWrite,
  existing?: SocialPostBrief | null
): SocialPostBrief {
  return socialPostBriefSchema.parse({
    theme: nonEmpty(write.theme, existing?.theme ?? ""),
    objective: nonEmpty(write.objective, existing?.objective ?? ""),
    audience: nonEmpty(write.audience, existing?.audience ?? ""),
    offer: nullable(write.offer, existing?.offer),
  });
}

/** Map canonical headline/body/cta → SocialPostCopy JSONB. */
export function toSocialPostCopy(
  write: CanonicalBriefingWrite,
  existing?: SocialPostCopy | null
): SocialPostCopy {
  return socialPostCopySchema.parse({
    headline: nonEmpty(write.headline, existing?.headline ?? ""),
    body: nonEmpty(write.body, existing?.body ?? ""),
    cta: nonEmpty(write.cta, existing?.cta ?? ""),
  });
}

/** Compat: legacy `{ headline, body, cta }` body → briefing write fields. */
export function socialPostCopyToBriefingWrite(
  copy: SocialPostCopy
): Pick<CanonicalBriefing, "headline" | "body" | "cta"> {
  return {
    headline: copy.headline,
    body: copy.body,
    cta: copy.cta,
  };
}
