import { z } from "zod";

/**
 * Visual person-fidelity comparison contract (plan 03, T3). The comparison is
 * assisted, evidence-based and tri-state: confirmed divergence blocks
 * selection, doubt requires a specific human review, and no similarity score
 * is ever promised.
 *
 * Client-safe (no node imports): the shared selection policy consumed by
 * browser components imports this module. Hash-bound builders live in
 * `@/server/ai/creative-quality-gate` next to the quality payload assembly.
 */

export const personFidelityFindingSchema = z
  .object({
    personId: z.string().uuid(),
    status: z.enum(["consistent", "mismatch", "inconclusive"]),
    evidence: z.array(z.string().trim().min(1).max(600)).max(12),
    issue: z.string().trim().min(1).max(300).nullable(),
  })
  .strict()
  .superRefine((finding, context) => {
    if (finding.status === "mismatch" && finding.evidence.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidence"],
        message: "mismatchRequiresEvidence",
      });
    }
  });

export type PersonFidelityFinding = z.infer<typeof personFidelityFindingSchema>;

export const personFidelityReviewSchema = z
  .object({
    actorId: z.string().min(1).max(200),
    at: z.string().datetime(),
    outputId: z.string().uuid(),
    referenceHash: z.string().regex(/^[a-f0-9]{64}$/),
    accepted: z.boolean(),
  })
  .strict();

export type PersonFidelityReview = z.infer<typeof personFidelityReviewSchema>;

export const personFidelityBlockSchema = z
  .object({
    findings: z.array(personFidelityFindingSchema).min(1).max(10),
    referenceHash: z.string().regex(/^[a-f0-9]{64}$/),
    review: personFidelityReviewSchema.optional(),
  })
  .strict();

export type PersonFidelityBlock = z.infer<typeof personFidelityBlockSchema>;

export type PersonFidelityGate = "pass" | "fail" | "human_review";

export function personFidelityGate(
  findings: readonly PersonFidelityFinding[],
): PersonFidelityGate {
  if (findings.some((finding) => finding.status === "mismatch")) return "fail";
  if (findings.some((finding) => finding.status === "inconclusive")) return "human_review";
  return "pass";
}

/** Read the person-fidelity block from persisted output quality, if any. */
export function resolvePersonFidelity(quality: unknown): PersonFidelityBlock | null {
  if (!quality || typeof quality !== "object" || Array.isArray(quality)) return null;
  const block = (quality as Record<string, unknown>).personFidelity;
  if (block === undefined || block === null) return null;
  const parsed = personFidelityBlockSchema.safeParse(block);
  return parsed.success ? parsed.data : null;
}

export type PersonFidelitySelection = "selectable" | "needs_review" | "blocked";

/**
 * Selection decision for a fidelity block. Null means no person fidelity is
 * involved (legacy selection behavior). A human review only counts when bound
 * to THIS output and reference hash; a negative review blocks, an accepted
 * review resolves inconclusive only — confirmed mismatch stays blocked.
 */
export function personFidelitySelectionGate(
  block: PersonFidelityBlock | null,
  outputId: string | null,
): PersonFidelitySelection | null {
  if (!block) return null;
  const review = block.review;
  const bound =
    outputId !== null &&
    review !== undefined &&
    review.outputId === outputId &&
    review.referenceHash === block.referenceHash;
  if (bound && !review.accepted) return "blocked";
  if (block.findings.some((finding) => finding.status === "mismatch")) return "blocked";
  if (block.findings.some((finding) => finding.status === "inconclusive")) {
    return bound && review.accepted ? "selectable" : "needs_review";
  }
  return "selectable";
}
