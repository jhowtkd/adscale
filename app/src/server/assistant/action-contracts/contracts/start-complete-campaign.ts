import { z } from "zod";
import { CREDIT_COSTS } from "@/server/billing/credits";
import type { ActionContract } from "../types";

export const startCompleteCampaignInputSchema = z
  .object({
    productOffer: z.string().min(1),
    audience: z.string().min(1),
    objective: z.string().min(1),
    cta: z.string().min(1),
    platformOrFormat: z.string().min(1),
    constraints: z.string().min(1),
    baseCreativeId: z.string().uuid(),
    styleReferenceId: z.string().uuid().optional(),
  })
  .strict();

export const startCompleteCampaignContract: ActionContract<
  typeof startCompleteCampaignInputSchema
> = {
  actionType: "start_complete_campaign",
  intentFamily: "complete_campaign",
  label: "Iniciar campanha completa",
  inputSchema: startCompleteCampaignInputSchema,
  requiredFields: [
    "productOffer",
    "audience",
    "objective",
    "cta",
    "platformOrFormat",
    "constraints",
    "baseCreativeId",
  ],
  optionalFields: [
    {
      key: "styleReferenceId",
      riskCopyWhenMissing:
        "Sem referência de estilo, a direção visual inicial pode precisar de mais revisões.",
    },
  ],
  allowedRoles: ["owner", "admin", "member"],
  riskLabel: "high",
  creditImpact: {
    kind: "creditAction",
    action: "creative_plan",
    label: `A partir de ${CREDIT_COSTS.creative_plan} crédito (planejamento); geração adicional conforme uso`,
  },
  confirmationPolicy: "required",
};
