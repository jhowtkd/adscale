import { z } from "zod";
import type { ActionContract } from "../types";

export const reviseCreativePlanInputSchema = z
  .object({
    proposalId: z.string().uuid(),
    lineageId: z.string().uuid(),
    sourceVersionId: z.string().uuid(),
    payloadDigest: z.string().length(64),
    lineageHeadRevision: z.number().int().min(0).optional(),
  })
  .strict();

export const reviseCreativePlanContract: ActionContract<
  typeof reviseCreativePlanInputSchema
> = {
  actionType: "revise_creative_plan",
  intentFamily: "complete_campaign",
  label: "Confirmar revisão do plano",
  inputSchema: reviseCreativePlanInputSchema,
  requiredFields: ["proposalId", "lineageId", "sourceVersionId", "payloadDigest"],
  optionalFields: [],
  allowedRoles: ["owner", "admin", "member"],
  riskLabel: "medium",
  creditImpact: {
    kind: "fixed",
    credits: 0,
    label: "Sem custo de crédito",
  },
  confirmationPolicy: "required",
};
