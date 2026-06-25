import { z } from "zod";
import { CREDIT_COSTS } from "@/server/billing/credits";
import type { ActionContract } from "../types";

export const quickRegenerateInputSchema = z
  .object({
    derivationId: z.string().uuid(),
    feedback: z.string().max(2000).optional(),
  })
  .strict();

export const quickRegenerateContract: ActionContract<typeof quickRegenerateInputSchema> =
  {
    actionType: "quick_regenerate",
    intentFamily: "quick_action",
    label: "Regenerar derivação",
    inputSchema: quickRegenerateInputSchema,
    requiredFields: ["derivationId"],
    optionalFields: [
      {
        key: "feedback",
        riskCopyWhenMissing:
          "Sem feedback, a regeneração usa apenas o histórico de qualidade da peça.",
      },
    ],
    allowedRoles: ["owner", "admin", "member"],
    riskLabel: "medium",
    creditImpact: {
      kind: "creditAction",
      action: "regeneration",
      label: `${CREDIT_COSTS.regeneration} créditos`,
    },
    confirmationPolicy: "required",
  };
