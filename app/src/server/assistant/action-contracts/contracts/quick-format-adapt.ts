import { z } from "zod";
import { CREDIT_COSTS } from "@/server/billing/credits";
import type { ActionContract } from "../types";

export const quickFormatAdaptInputSchema = z
  .object({
    sourceDerivationId: z.string().uuid(),
    targetFormat: z.string().min(1),
    notes: z.string().max(2000).optional(),
  })
  .strict();

export const quickFormatAdaptContract: ActionContract<
  typeof quickFormatAdaptInputSchema
> = {
  actionType: "quick_format_adapt",
  intentFamily: "quick_action",
  label: "Adaptar formato",
  inputSchema: quickFormatAdaptInputSchema,
  requiredFields: ["sourceDerivationId", "targetFormat"],
  optionalFields: [
    {
      key: "notes",
      riskCopyWhenMissing:
        "Sem notas de layout, a adaptação segue apenas o criativo de origem.",
    },
  ],
  allowedRoles: ["owner", "admin", "member"],
  riskLabel: "medium",
  creditImpact: {
    kind: "creditAction",
    action: "image_derivation",
    label: `${CREDIT_COSTS.image_derivation} créditos`,
  },
  confirmationPolicy: "required",
};
