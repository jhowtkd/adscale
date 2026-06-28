import { z } from "zod";

export const artifactTypeSchema = z.enum(["plan", "creative"]);
export type ArtifactType = z.infer<typeof artifactTypeSchema>;

export const artifactOriginSchema = z.enum([
  "legacy_import",
  "native",
  "revision",
]);

const boundedText = z.string().trim().max(2_000);
const boundedTextList = z.array(z.string().trim().max(500)).max(50);

export const planVersionSnapshotSchema = z
  .object({
    type: z.literal("plan"),
    strategy: boundedText.nullable(),
    angles: boundedTextList,
    hooks: boundedTextList,
    ctas: boundedTextList,
    constraints: boundedText.nullable(),
  })
  .strict();

export const creativeVersionSnapshotSchema = z
  .object({
    type: z.literal("creative"),
    derivationId: z.string().uuid(),
    outputKey: z.string().trim().min(1).max(1_024).nullable(),
    format: z.string().trim().max(50).nullable(),
    generationMode: z.string().trim().max(100).nullable(),
    ctaText: z.string().trim().max(500).nullable(),
    planVersionId: z.string().uuid().nullable(),
  })
  .strict();

export const artifactVersionSnapshotSchema = z.discriminatedUnion("type", [
  planVersionSnapshotSchema,
  creativeVersionSnapshotSchema,
]);
export type ArtifactVersionSnapshot = z.infer<
  typeof artifactVersionSnapshotSchema
>;

export const artifactVersionProvenanceSchema = z
  .object({
    origin: artifactOriginSchema,
    originalArtifactId: z.string().uuid(),
    sourceVersionId: z.string().uuid().nullable(),
    messageId: z.string().uuid().nullable(),
    actionId: z.string().uuid().nullable(),
    planVersionId: z.string().uuid().nullable(),
    format: z.string().trim().max(50).nullable(),
    generationMode: z.string().trim().max(100).nullable(),
  })
  .strict();
export type ArtifactVersionProvenance = z.infer<
  typeof artifactVersionProvenanceSchema
>;

export const artifactVersionSummarySchema = z
  .object({
    id: z.string().uuid(),
    lineageId: z.string().uuid(),
    versionNumber: z.number().int().positive(),
    sourceVersionId: z.string().uuid().nullable(),
    status: z.string().trim().min(1).max(50),
    snapshot: artifactVersionSnapshotSchema,
    provenance: artifactVersionProvenanceSchema,
    feedback: z.string().max(2_000).nullable(),
    previouslyApproved: z.boolean().optional(),
    createdAt: z.coerce.date(),
  })
  .strict();

const proposalChangeSchema = z
  .object({
    field: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(500),
  })
  .strict();

export const artifactProposalPayloadSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("plan_revision"),
      schemaVersion: z.literal(1),
      summary: z.string().trim().min(1).max(1_000),
      proposedSnapshot: planVersionSnapshotSchema,
      changes: z.array(proposalChangeSchema).max(50),
      writes: boundedTextList,
    })
    .strict(),
  z
    .object({
      type: z.literal("creative_revision"),
      schemaVersion: z.literal(1),
      summary: z.string().trim().min(1).max(1_000),
      intendedChanges: boundedTextList,
      format: z.string().trim().max(50).nullable(),
      referenceIds: z.array(z.string().uuid()).max(50),
      creditImpact: z.number().int().nonnegative(),
      writes: boundedTextList,
      planVersionId: z.string().uuid(),
    })
    .strict(),
]);
export type ArtifactProposalPayload = z.infer<
  typeof artifactProposalPayloadSchema
>;

export const artifactProposalSummarySchema = z
  .object({
    id: z.string().uuid(),
    lineageId: z.string().uuid(),
    sourceVersionId: z.string().uuid(),
    proposalType: z.enum(["plan_revision", "creative_revision"]),
    status: z.enum(["pending", "stale", "confirmed", "canceled"]),
    feedback: z.string().max(2_000).nullable(),
    payload: artifactProposalPayloadSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

export const artifactVersionPresentationSchema = z
  .object({
    lineageId: z.string().uuid(),
    artifactType: artifactTypeSchema,
    approvedCurrent: artifactVersionSummarySchema.nullable(),
    working: artifactVersionSummarySchema.nullable(),
    versions: z.array(artifactVersionSummarySchema),
    pendingProposals: z.array(artifactProposalSummarySchema),
    generationStatus: z
      .object({
        status: z.string().trim().min(1).max(50),
        safeError: z.string().max(500).nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type ArtifactVersionPresentation = z.infer<
  typeof artifactVersionPresentationSchema
>;

export const comparisonVersionHeaderSchema = z
  .object({
    versionNumber: z.number().int().positive(),
    status: z.string().trim().min(1).max(50),
    createdAt: z.coerce.date(),
    feedback: boundedText.nullable(),
  })
  .strict();

export const planComparisonChangeSchema = z
  .object({
    kind: z.enum(["add", "remove", "edit", "move", "unchanged"]),
    before: z.string().max(2_000).nullable(),
    after: z.string().max(2_000).nullable(),
    beforeIndex: z.number().int().nonnegative().nullable(),
    afterIndex: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const planComparisonFieldSchema = z
  .object({
    field: z.enum(["strategy", "angles", "hooks", "ctas", "constraints"]),
    label: z.string().trim().min(1).max(100),
    changed: z.boolean(),
    changes: z.array(planComparisonChangeSchema).max(100),
  })
  .strict();

const creativeComparisonVersionSchema = comparisonVersionHeaderSchema.extend({
  previewUrl: z.string().url().nullable(),
  previewError: z.enum(["preview_unavailable"]).nullable(),
  format: z.string().trim().max(50).nullable(),
  dimensions: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .strict()
    .nullable(),
  cta: z.string().trim().max(500).nullable(),
  boundPlanVersion: z.string().trim().max(50).nullable(),
  intendedChanges: boundedTextList,
}).strict();

export const artifactVersionComparisonSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("plan"),
      headRevision: z.number().int().nonnegative(),
      versionA: comparisonVersionHeaderSchema,
      versionB: comparisonVersionHeaderSchema,
      fields: z.array(planComparisonFieldSchema).max(5),
    })
    .strict(),
  z
    .object({
      type: z.literal("creative"),
      headRevision: z.number().int().nonnegative(),
      versionA: creativeComparisonVersionSchema,
      versionB: creativeComparisonVersionSchema,
    })
    .strict(),
]);
export type ArtifactVersionComparison = z.infer<
  typeof artifactVersionComparisonSchema
>;

const promotionTargetSchema = z
  .object({
    lineageId: z.string().uuid(),
    targetVersionId: z.string().uuid(),
    expectedOfficialVersionId: z.string().uuid().nullable(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();

export const artifactPromotionCommandSchema = z.discriminatedUnion("type", [
  promotionTargetSchema
    .extend({
      type: z.literal("plan"),
      operationId: z.string().uuid(),
    })
    .strict(),
  promotionTargetSchema
    .extend({
      type: z.literal("creative"),
      operationId: z.string().uuid(),
      planTransition: promotionTargetSchema
        .extend({ acknowledgementId: z.string().uuid() })
        .strict()
        .nullable(),
    })
    .strict(),
]);
export type ArtifactPromotionCommand = z.infer<
  typeof artifactPromotionCommandSchema
>;

export const comparisonAcknowledgementCommandSchema = z
  .object({
    creativeTargetVersionId: z.string().uuid(),
    planLineageId: z.string().uuid(),
    linkedPlanVersionId: z.string().uuid(),
    comparedOfficialPlanVersionId: z.string().uuid(),
    expectedPlanRevision: z.number().int().nonnegative(),
  })
  .strict();
export type ComparisonAcknowledgementCommand = z.infer<
  typeof comparisonAcknowledgementCommandSchema
>;

export const comparisonAcknowledgementSchema =
  comparisonAcknowledgementCommandSchema
    .extend({
      id: z.string().uuid(),
      createdAt: z.coerce.date(),
    })
    .strict();

const promotionTransitionSchema = z
  .object({
    artifactType: artifactTypeSchema,
    fromVersion: z.string().trim().min(1).max(50),
    toVersion: z.string().trim().min(1).max(50),
  })
  .strict();

export const artifactPromotionEffectSchema = z
  .object({
    transitions: z.array(promotionTransitionSchema).min(1).max(2),
    canonicalWrites: boundedTextList,
    staleProposalCount: z.number().int().nonnegative(),
    creditImpact: z.literal(0),
  })
  .strict();
export type ArtifactPromotionEffect = z.infer<
  typeof artifactPromotionEffectSchema
>;

export const artifactPromotionResultSchema = z
  .object({
    effect: artifactPromotionEffectSchema,
    state: z.array(artifactVersionPresentationSchema).min(1).max(2),
  })
  .strict();
export type ArtifactPromotionResult = z.infer<
  typeof artifactPromotionResultSchema
>;

export const artifactPromotionConflictSchema = z
  .object({
    error: z.literal("revisionConflict"),
    message: z.string().trim().min(1).max(500),
    previousOfficialLabel: z.string().trim().min(1).max(50),
    currentOfficialLabel: z.string().trim().min(1).max(50),
    state: z.array(artifactVersionPresentationSchema).min(1).max(2),
  })
  .strict();
