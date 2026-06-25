import { z } from "zod";
import type { ActionContract } from "../types";

const referenceKindSchema = z.enum([
  "style",
  "product",
  "layout",
  "logo",
  "negative",
  "other",
]);

export const quickSaveReferenceInputSchema = z
  .object({
    derivationId: z.string().uuid(),
    label: z.string().trim().min(1).max(120),
    kind: referenceKindSchema.optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

export const quickSaveReferenceContract: ActionContract<
  typeof quickSaveReferenceInputSchema
> = {
  actionType: "quick_save_reference",
  intentFamily: "quick_action",
  label: "Salvar como referência",
  inputSchema: quickSaveReferenceInputSchema,
  requiredFields: ["derivationId", "label"],
  optionalFields: [
    {
      key: "kind",
      riskCopyWhenMissing: "Sem tipo, a referência será salva como estilo.",
    },
    {
      key: "notes",
      riskCopyWhenMissing: "Sem notas, a referência terá apenas o rótulo.",
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
