import { z } from "zod";
import { GUIDANCE_ROLES, hashGuidanceSet } from "../../brand-taste/learned-guidance";

const id = z.string().trim().min(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const arm = z.object({
  fixedPromptVersion: id,
  appliedRefs: z.array(z.object({ ruleId: id, revision: z.union([z.number().int().positive(), z.literal("legacy")]), contentHash: hash }).strict()).max(5),
  setHash: hash.nullable(),
}).strict();

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  experimentId: id,
  origin: z.literal("simulated"),
  provider: z.literal("controlled"),
  changedFeatures: z.array(z.literal("guidance_revisions")).length(1),
  window: z.object({ startsAt: z.string().datetime(), endsAt: z.string().datetime() }).strict(),
  closedAt: z.string().datetime().nullable(),
  brands: z.array(z.object({
    workspaceId: id, clientProfileId: id,
    role: z.enum(GUIDANCE_ROLES), generationMode: id, format: id,
    training: z.object({ contextIds: z.array(id), evidenceIds: z.array(id) }).strict(),
    holdout: z.array(z.object({
      contextId: id, contextKind: z.enum(["creative_work", "legacy_campaign"]), inputsHash: hash, evidenceIds: z.array(id).min(1),
    }).strict()).min(1),
    exclusions: z.array(z.object({ contextId: id, reason: id }).strict()),
    arms: z.object({ treatment: arm, control: arm }).strict(),
  }).strict()).min(1),
}).strict();

export type GuidanceExperimentManifest = z.infer<typeof manifestSchema>;
export type GuidanceManifestValidation = {
  realExecutionAllowed: false;
  realExecutionBlock: "d4_pending_704";
} & ({ ok: true; manifest: GuidanceExperimentManifest; failures: [] } | { ok: false; failures: string[] });

function freeze(value: object): void {
  for (const child of Object.values(value)) if (child !== null && typeof child === "object") freeze(child);
  Object.freeze(value);
}

/** D4 has no recorded decision. No caller-provided authorization can enable a real experiment. */
export function validateGuidanceExperimentManifest(input: unknown): GuidanceManifestValidation {
  const gate = { realExecutionAllowed: false, realExecutionBlock: "d4_pending_704" } as const;
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) return { ...gate, ok: false, failures: parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`) };
  const manifest = parsed.data;
  const failures: string[] = [];
  const start = Date.parse(manifest.window.startsAt), end = Date.parse(manifest.window.endsAt);
  if (start >= end) failures.push("window: startsAt must precede endsAt");
  if (manifest.closedAt && Date.parse(manifest.closedAt) < end) failures.push("closedAt: cannot close before the frozen window ends");
  const brands = new Set<string>();
  const trainingEvidence = new Set(manifest.brands.flatMap(brand => brand.training.evidenceIds));
  const trainingContexts = new Set(manifest.brands.flatMap(brand => brand.training.contextIds));
  for (const brand of manifest.brands) {
    const key = JSON.stringify([brand.workspaceId, brand.clientProfileId]);
    if (brands.has(key)) failures.push("brands: duplicate workspace/brand");
    brands.add(key);
    const { treatment, control } = brand.arms;
    if ([treatment, control].some(item => item.fixedPromptVersion.toLowerCase() === "unknown")
      || treatment.fixedPromptVersion !== control.fixedPromptVersion) failures.push("arms: fixedPromptVersion must be known and identical");
    if (!treatment.appliedRefs.length || control.appliedRefs.length || control.setHash !== null) failures.push("arms: require learned treatment and empty control");
    for (const item of [treatment, control]) {
      if (item.setHash !== hashGuidanceSet(item.appliedRefs)
        || new Set(item.appliedRefs.map(ref => ref.ruleId)).size !== item.appliedRefs.length) failures.push("arms: invalid frozen selection");
    }
    const contexts = new Set<string>();
    for (const item of brand.holdout) {
      if (contexts.has(item.contextId)) failures.push("holdout: duplicate context");
      contexts.add(item.contextId);
      if (trainingContexts.has(item.contextId) || item.evidenceIds.some(id => trainingEvidence.has(id))) failures.push("holdout: training contamination");
      if (brand.exclusions.some(excluded => excluded.contextId === item.contextId)) failures.push("holdout: excluded context");
    }
  }
  if (failures.length) return { ...gate, ok: false, failures };
  freeze(manifest);
  return { ...gate, ok: true, manifest, failures: [] };
}
