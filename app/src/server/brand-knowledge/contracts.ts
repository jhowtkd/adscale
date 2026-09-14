import { z } from "zod";

import { visualRepertoireSchema } from "../brand-training/visual-repertoire";
import { peopleCatalogSchema } from "../brand-training/people";

export const BRAND_KNOWLEDGE_CLAIM_KEYS = [
  "palette.colors",
  "typography.families",
  "typography.headline",
  "typography.body",
  "logo.primary_asset",
  "logo.placement",
  "layout.density",
  "layout.hierarchy",
  "imagery.treatment",
  "graphic.treatment",
  "visual.required_elements",
  "visual.prohibited_elements",
  "visual.repertoire",
  "people.catalog",
] as const;

export const brandKnowledgeClaimKeySchema = z.enum(BRAND_KNOWLEDGE_CLAIM_KEYS);
export type BrandKnowledgeClaimKey = z.infer<typeof brandKnowledgeClaimKeySchema>;
export const brandKnowledgeClaimStatusSchema = z.enum(["candidate", "approved", "rejected", "superseded"]);
export type BrandKnowledgeClaimStatus = z.infer<typeof brandKnowledgeClaimStatusSchema>;

export interface BrandKnowledgeEvidenceRef {
  type: "brand_kit_field" | "brand_guide" | "training_asset" | "human";
  id: string;
  path: string;
  sourceHash: string;
}

export const brandKnowledgeEvidenceKey = (evidence: Pick<BrandKnowledgeEvidenceRef, "type" | "id" | "path">) =>
  `${evidence.type}:${evidence.id}:${evidence.path}`;

export interface BrandKnowledgeClaimInput {
  claimKey: BrandKnowledgeClaimKey;
  kind: "fact" | "rule" | "preference" | "prohibition";
  value: unknown;
  scope: { level: "global"; format?: "1:1" | "4:5" | "9:16"; channel?: string };
  authority: "human" | "explicit" | "measured" | "inferred";
  confidence: "low" | "medium" | "high";
  evidenceRefs: BrandKnowledgeEvidenceRef[];
  extractorVersion: string;
  sourceHash: string;
}

export type BrandKnowledgeJsonValue = string | number | boolean | null | BrandKnowledgeJsonValue[] | { [key: string]: BrandKnowledgeJsonValue };
export const brandKnowledgeJsonValueSchema: z.ZodType<BrandKnowledgeJsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(brandKnowledgeJsonValueSchema),
  z.record(brandKnowledgeJsonValueSchema),
]));

export const brandKnowledgeEvidenceRefSchema = z.object({
  type: z.enum(["brand_kit_field", "brand_guide", "training_asset", "human"]),
  id: z.string().min(1),
  path: z.string().trim().min(1).max(240),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
});

const scopeSchema = z.object({
  level: z.literal("global"),
  format: z.enum(["1:1", "4:5", "9:16"]).optional(),
  channel: z.string().trim().min(1).max(80).optional(),
});

const stringList = z.array(z.string().trim().min(1).max(240)).min(1).max(50);
const valueSchemas: Record<BrandKnowledgeClaimKey, z.ZodType> = {
  "palette.colors": z.array(z.string().regex(/^#[0-9A-F]{6}$/)).min(1).max(50),
  "typography.families": stringList,
  "typography.headline": z.object({ family: z.string().trim().min(1), weight: z.number().int().min(100).max(900), style: z.enum(["normal", "italic"]) }),
  "typography.body": z.object({ family: z.string().trim().min(1), weight: z.number().int().min(100).max(900), style: z.enum(["normal", "italic"]) }),
  "logo.primary_asset": z.object({ assetKey: z.string().trim().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  "logo.placement": z.string().trim().min(1).max(240),
  "layout.density": z.enum(["sparse", "balanced", "dense"]),
  "layout.hierarchy": z.string().trim().min(1).max(240),
  "imagery.treatment": z.string().trim().min(1).max(240),
  "graphic.treatment": z.string().trim().min(1).max(240),
  "visual.required_elements": stringList,
  "visual.prohibited_elements": stringList,
  "visual.repertoire": visualRepertoireSchema,
  "people.catalog": peopleCatalogSchema,
};

const baseClaimSchema = z.object({
  claimKey: brandKnowledgeClaimKeySchema,
  kind: z.enum(["fact", "rule", "preference", "prohibition"]),
  value: brandKnowledgeJsonValueSchema,
  scope: scopeSchema,
  authority: z.enum(["human", "explicit", "measured", "inferred"]),
  confidence: z.enum(["low", "medium", "high"]),
  evidenceRefs: z.array(brandKnowledgeEvidenceRefSchema).min(1).max(20),
  extractorVersion: z.string().trim().min(1).max(80),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const brandKnowledgeClaimInputSchema = baseClaimSchema.superRefine((claim, context) => {
  const parsed = valueSchemas[claim.claimKey].safeParse(claim.value);
  if (!parsed.success) context.addIssue({ code: "custom", path: ["value"], message: "Invalid value for claim key" });
});

export interface BrandKnowledgeClaim extends BrandKnowledgeClaimInput {
  id: string;
  workspaceId: string;
  clientProfileId: string;
  status: BrandKnowledgeClaimStatus;
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const reviewBrandKnowledgeClaimSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  value: z.unknown().optional(),
});

export function parseBrandKnowledgeClaimInput(value: unknown): BrandKnowledgeClaimInput {
  const parsed = brandKnowledgeClaimInputSchema.parse(value) as BrandKnowledgeClaimInput;
  return { ...parsed, value: valueSchemas[parsed.claimKey].parse(parsed.value) };
}
