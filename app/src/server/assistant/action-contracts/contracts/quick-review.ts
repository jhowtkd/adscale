import { z } from "zod";
import type { ActionContract } from "../types";

const reviewDecisionSchema = z.enum(["entra", "quase_regenerar", "nao_entra"]);

export const quickReviewInputSchema = z
  .object({
    derivationId: z.string().uuid(),
    decision: reviewDecisionSchema,
    directionReason: z.string().max(2000).optional(),
  })
  .strict();

export const quickReviewContract: ActionContract<typeof quickReviewInputSchema> = {
  actionType: "quick_review",
  intentFamily: "quick_action",
  label: "Revisar derivação",
  inputSchema: quickReviewInputSchema,
  requiredFields: ["derivationId", "decision"],
  optionalFields: [
    {
      key: "directionReason",
      riskCopyWhenMissing:
        "Sem motivo de direção, a decisão fica registrada sem contexto adicional.",
    },
  ],
  allowedRoles: ["owner", "admin", "member"],
  riskLabel: "low",
  creditImpact: {
    kind: "fixed",
    credits: 0,
    label: "Sem custo de crédito",
  },
  confirmationPolicy: "required",
};
