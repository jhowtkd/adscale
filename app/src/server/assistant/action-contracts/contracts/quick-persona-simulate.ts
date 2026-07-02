import { z } from "zod";
import { CREDIT_COSTS } from "@/server/billing/credits";
import type { ActionContract } from "../types";

export const quickPersonaSimulateInputSchema = z
  .object({
    baseCreativeId: z.string().uuid(),
    personaCount: z.number().int().min(1).max(5).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

export const quickPersonaSimulateContract: ActionContract<
  typeof quickPersonaSimulateInputSchema
> = {
  actionType: "quick_persona_simulate",
  intentFamily: "quick_action",
  label: "Simulação de persona",
  inputSchema: quickPersonaSimulateInputSchema,
  requiredFields: ["baseCreativeId"],
  optionalFields: [
    {
      key: "notes",
      riskCopyWhenMissing:
        "Sem notas de direção, a simulação usa personas padrão do perfil do cliente.",
    },
  ],
  allowedRoles: ["owner", "admin", "member"],
  riskLabel: "low",
  creditImpact: {
    kind: "fixed",
    credits: CREDIT_COSTS.personaSimulation,
    label: `${CREDIT_COSTS.personaSimulation} créditos`,
  },
  confirmationPolicy: "required",
};
