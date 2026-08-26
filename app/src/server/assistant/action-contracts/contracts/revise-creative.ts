import { z } from "zod";
import { CREDIT_COSTS } from "@/lib/billing/credit-units";
import type { ActionContract } from "../types";

export const reviseCreativeInputSchema = z
  .object({
    proposalId: z.string().uuid(),
    lineageId: z.string().uuid(),
    sourceVersionId: z.string().uuid(),
    payloadDigest: z.string().length(64),
    planVersionId: z.string().uuid(),
    lineageHeadRevision: z.number().int().min(0).optional(),
  })
  .strict();

export const reviseCreativeContract: ActionContract<
  typeof reviseCreativeInputSchema
> = {
  actionType: "revise_creative",
  intentFamily: "complete_campaign",
  label: "Confirmar revisão do criativo",
  inputSchema: reviseCreativeInputSchema,
  requiredFields: [
    "proposalId",
    "lineageId",
    "sourceVersionId",
    "payloadDigest",
    "planVersionId",
  ],
  optionalFields: [],
  allowedRoles: ["owner", "admin", "member"],
  riskLabel: "medium",
  creditImpact: {
    kind: "creditAction",
    action: "image_derivation",
    label: `${CREDIT_COSTS.image_derivation} créditos`,
  },
  confirmationPolicy: "required",
};
