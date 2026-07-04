import { z } from "zod";
import type { ActionContract } from "../types";

/**
 * One paid annotation revision batch. The user draws multiple rectangle
 * annotations on the selected base; they are frozen and submitted as a single
 * non-refundable 5-credit revision that produces one child derivation whose
 * `parentId` is the source. The annotations stay attached to the source version
 * even after the new version is produced.
 */
export const reviseCreativeAnnotationsInputSchema = z
  .object({
    goalRunId: z.string().uuid(),
    goalRevision: z.number().int().nonnegative(),
    sourceVersionId: z.string().uuid(),
    planVersionId: z.string().uuid(),
    annotationIds: z.array(z.string().uuid()).min(1).max(20),
  })
  .strict();

export const reviseCreativeAnnotationsContract: ActionContract<
  typeof reviseCreativeAnnotationsInputSchema
> = {
  actionType: "revise_creative_annotations",
  intentFamily: "complete_campaign",
  label: "Revisar criativo com anotações",
  inputSchema: reviseCreativeAnnotationsInputSchema,
  requiredFields: [
    "goalRunId",
    "goalRevision",
    "sourceVersionId",
    "planVersionId",
    "annotationIds",
  ],
  optionalFields: [],
  allowedRoles: ["owner", "admin", "member"],
  riskLabel: "high",
  creditImpact: {
    kind: "creditAction",
    action: "image_derivation",
    amount: 5,
    label: "5 créditos",
  },
  confirmationPolicy: "required",
  alwaysRiskCopy: [
    "Cobrança definitiva: não há estorno, inclusive se a revisão falhar.",
  ],
};
