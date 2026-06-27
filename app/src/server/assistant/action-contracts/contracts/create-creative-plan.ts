import { z } from "zod";
import { CREDIT_COSTS } from "@/server/billing/credits";
import type { ActionContract } from "../types";

export const createCreativePlanInputSchema = z
  .object({
    productOffer: z.string().min(1),
    audience: z.string().min(1),
    objective: z.string().min(1),
    cta: z.string().min(1),
    platformOrFormat: z.string().min(1),
    constraints: z.string().min(1),
    referenceIds: z.array(z.string().uuid()).min(3),
  })
  .strict();

export const createCreativePlanContract: ActionContract<
  typeof createCreativePlanInputSchema
> = {
  actionType: "create_creative_plan",
  intentFamily: "complete_campaign",
  label: "Criar plano criativo",
  inputSchema: createCreativePlanInputSchema,
  requiredFields: [
    "productOffer",
    "audience",
    "objective",
    "cta",
    "platformOrFormat",
    "constraints",
    "referenceIds",
  ],
  optionalFields: [],
  allowedRoles: ["owner", "admin", "member"],
  riskLabel: "high",
  creditImpact: {
    kind: "creditAction",
    action: "creative_plan",
    label: `${CREDIT_COSTS.creative_plan} crédito para planejamento`,
  },
  confirmationPolicy: "required",
};
