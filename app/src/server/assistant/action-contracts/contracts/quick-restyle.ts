import { z } from "zod";
import { CREDIT_COSTS } from "@/server/billing/credits";
import type { ActionContract } from "../types";

export const quickRestyleInputSchema = z
  .object({
    baseCreativeId: z.string().uuid(),
    styleReferenceId: z.string().uuid().optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

export const quickRestyleContract: ActionContract<typeof quickRestyleInputSchema> =
  {
    actionType: "quick_restyle",
    intentFamily: "quick_action",
    label: "Restyle rápido",
    inputSchema: quickRestyleInputSchema,
    requiredFields: ["baseCreativeId"],
    optionalFields: [
      {
        key: "styleReferenceId",
        riskCopyWhenMissing:
          "Sem referência de estilo, o resultado pode divergir mais da marca.",
      },
    ],
    allowedRoles: ["owner", "admin", "member"],
    riskLabel: "medium",
    creditImpact: {
      kind: "creditAction",
      action: "restyling",
      label: `${CREDIT_COSTS.restyling} créditos`,
    },
    confirmationPolicy: "required",
  };
