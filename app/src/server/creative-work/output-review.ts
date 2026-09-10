import { z } from "zod";
import { creativeWorkFormatSchema } from "./contracts";

const annotationSchema = z
  .object({
    id: z.string().uuid(),
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    text: z.string().trim().min(1).max(100),
  })
  .strict();

const fields = z
  .object({
    action: z.enum(["refine", "variation", "format"]),
    targetFormat: creativeWorkFormatSchema,
    instruction: z.string().trim().max(800),
    revisionAssetId: z.string().uuid().nullable(),
    annotations: z.array(annotationSchema).max(8),
  })
  .strict();

export type OutputReviewInput = z.infer<typeof fields>;

export function compileOutputReview(input: OutputReviewInput): string {
  const action =
    input.action === "format"
      ? `Adapte a mesma peça para ${input.targetFormat}. Preserve os fatos e a identidade visual.`
      : input.action === "variation"
        ? "Crie uma variação relacionada à peça base; preserve os fatos e a marca."
        : "Refine a peça base conforme as instruções abaixo.";
  return [
    action,
    input.instruction,
    ...input.annotations.map(
      (note, i) =>
        `${i + 1}. Em x=${Math.round(note.x * 100)}%, y=${Math.round(note.y * 100)}%: ${note.text}`,
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

export const outputReviewInputSchema = fields.superRefine((value, ctx) => {
  if (
    new Set(value.annotations.map((note) => note.id)).size !==
    value.annotations.length
  )
    ctx.addIssue({ code: "custom", message: "Comentários duplicados." });
  if (compileOutputReview(value).length > 2000)
    ctx.addIssue({ code: "custom", message: "Reduza o pedido ou os comentários." });
});

export const outputReviewDraftSchema = fields
  .extend({
    version: z.literal(1),
    revision: z.number().int().positive(),
    revisionKey: z.string().uuid(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.annotations.map((note) => note.id)).size !==
      value.annotations.length
    )
      ctx.addIssue({ code: "custom", message: "Comentários duplicados." });
    if (compileOutputReview(value).length > 2000)
      ctx.addIssue({
        code: "custom",
        message: "Reduza o pedido ou os comentários.",
      });
  });

export type OutputReviewDraftV1 = z.infer<typeof outputReviewDraftSchema>;

export const outputRevisionContextSchema = fields
  .extend({
    version: z.literal(1),
    reviewRevision: z.number().int().positive(),
    sourceOutputId: z.string().uuid(),
    sourceOutputVersion: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.annotations.map((note) => note.id)).size !==
      value.annotations.length
    )
      ctx.addIssue({ code: "custom", message: "Comentários duplicados." });
    if (compileOutputReview(value).length > 2000)
      ctx.addIssue({
        code: "custom",
        message: "Reduza o pedido ou os comentários.",
      });
  });

export type OutputRevisionContextV1 = z.infer<
  typeof outputRevisionContextSchema
>;

/**
 * Empty draft allowed for autosave; Review is blocked when a refine has no
 * free text and no notes. Save accepts empty, confirm enforces content.
 */
export function canReviewOutputDraft(draft: OutputReviewInput): boolean {
  return (
    draft.action !== "refine" ||
    Boolean(draft.instruction.trim()) ||
    draft.annotations.length > 0
  );
}

/**
 * Validates a persisted review draft. Historic null stays null; unknown or
 * schema-invalid JSON is rejected as null so private/extra keys never cross
 * the public projection and an invalid row is never trusted as CAS authority.
 * Callers that need absent-vs-invalid distinguished must check null first.
 */
export function parsePersistedOutputReviewDraft(
  value: unknown,
): OutputReviewDraftV1 | null {
  if (value == null) return null;
  const parsed = outputReviewDraftSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Validates a persisted revision context with the same null-preserving,
 * reject-invalid contract as the draft parser.
 */
export function parsePersistedOutputRevisionContext(
  value: unknown,
): OutputRevisionContextV1 | null {
  if (value == null) return null;
  const parsed = outputRevisionContextSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
