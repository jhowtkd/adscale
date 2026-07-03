import { z } from "zod";
import type { ActionContract } from "../types";

/**
 * Input contract for the "start brand training" assistant action.
 *
 * `clientProfileId` is optional: when omitted, the handler resolves the
 * workspace's sole profile, or surfaces an ambiguity the user must resolve in
 * the wizard's first step.
 */
export const startBrandTrainingInputSchema = z
  .object({
    clientProfileId: z.string().uuid().optional(),
  })
  .strict();

export const startBrandTrainingContract: ActionContract<
  typeof startBrandTrainingInputSchema
> = {
  actionType: "start_brand_training",
  intentFamily: "quick_action",
  label: "Treinar identidade de marca",
  inputSchema: startBrandTrainingInputSchema,
  requiredFields: [],
  optionalFields: [
    {
      key: "clientProfileId",
      riskCopyWhenMissing:
        "Sem clientProfileId, o treinamento abrirá o seletor de perfil para escolher qual marca treinar.",
    },
  ],
  allowedRoles: ["owner", "admin", "member"],
  riskLabel: "low",
  creditImpact: {
    kind: "fixed",
    credits: 0,
    label: "Sem custo de crédito",
  },
  confirmationPolicy: "none",
};
