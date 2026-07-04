import { z } from "zod";
import type { ActionContract } from "../types";

/**
 * Initial controlled creative batch. The goal agent proposes exactly one of
 * these once the brief and plan are ready. It creates three `1:1` derivations
 * that differ ONLY in `creativeLevel` (conservative, balanced, bold), so the
 * three candidates form a clean controlled comparison at equal visual weight.
 *
 * The 15-credit charge is fixed and definitive: there is no refund, including
 * when an individual generation fails technically. That policy is stated on
 * every confirmation card via `alwaysRiskCopy`.
 */
export const generateCreativeTripletInputSchema = z
  .object({
    goalRunId: z.string().uuid(),
    goalRevision: z.number().int().nonnegative(),
    planVersionId: z.string().uuid(),
    format: z.literal("1:1"),
  })
  .strict();

export const generateCreativeTripletContract: ActionContract<
  typeof generateCreativeTripletInputSchema
> = {
  actionType: "generate_creative_triplet",
  intentFamily: "complete_campaign",
  label: "Gerar três direções criativas",
  inputSchema: generateCreativeTripletInputSchema,
  requiredFields: ["goalRunId", "goalRevision", "planVersionId", "format"],
  optionalFields: [],
  allowedRoles: ["owner", "admin", "member"],
  riskLabel: "high",
  creditImpact: {
    kind: "creditAction",
    action: "image_derivation",
    amount: 15,
    label: "15 créditos",
  },
  confirmationPolicy: "required",
  alwaysRiskCopy: [
    "Cobrança definitiva: não há estorno, inclusive se uma geração falhar.",
  ],
};
