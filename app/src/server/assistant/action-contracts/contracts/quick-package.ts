import { z } from "zod";
import { CREDIT_COSTS } from "@/server/billing/credits";
import type { ActionContract } from "../types";

export const quickPackageInputSchema = z
  .object({
    sourceDerivationId: z.string().uuid(),
    formats: z.array(z.string().min(1)).min(1),
    notes: z.string().max(2000).optional(),
  })
  .strict();

export const quickPackageContract: ActionContract<typeof quickPackageInputSchema> =
  {
    actionType: "quick_package",
    intentFamily: "quick_action",
    label: "Gerar pacote de entrega",
    inputSchema: quickPackageInputSchema,
    requiredFields: ["sourceDerivationId", "formats"],
    optionalFields: [
      {
        key: "notes",
        riskCopyWhenMissing:
          "Sem notas, o pacote inclui apenas os formatos selecionados.",
      },
    ],
    allowedRoles: ["owner", "admin", "member"],
    riskLabel: "medium",
    creditImpact: {
      kind: "creditAction",
      action: "delivery_package_child",
      label: `A partir de ${CREDIT_COSTS.delivery_package_child} créditos por formato`,
    },
    confirmationPolicy: "required",
  };
