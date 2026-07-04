import { z } from "zod";
import { GOAL_FORMATS } from "@/lib/assistant/goal";
import type { ActionContract } from "../types";

const PACKAGE_FORMATS = GOAL_FORMATS.filter((f) => f !== "1:1");

/**
 * Proposes the three missing package formats once a 1:1 base is approved. The
 * base already counts toward the four-format package, so this charges 15
 * credits once for the three additional formats (4:5, 9:16, 16:9) and is
 * non-refundable. Each child preserves the approved base's copy, offer, CTA,
 * identity, and creative level — format adaptation varies only layout.
 */
export const generateGoalPackageInputSchema = z
  .object({
    goalRunId: z.string().uuid(),
    goalRevision: z.number().int().nonnegative(),
    baseVersionId: z.string().uuid(),
    planVersionId: z.string().uuid(),
  })
  .strict();

export const generateGoalPackageContract: ActionContract<
  typeof generateGoalPackageInputSchema
> = {
  actionType: "generate_goal_package",
  intentFamily: "complete_campaign",
  label: "Gerar pacote de formatos",
  inputSchema: generateGoalPackageInputSchema,
  requiredFields: ["goalRunId", "goalRevision", "baseVersionId", "planVersionId"],
  optionalFields: [],
  allowedRoles: ["owner", "admin", "member"],
  riskLabel: "high",
  creditImpact: {
    kind: "creditAction",
    action: "delivery_package_child",
    amount: 15,
    label: "15 créditos — três formatos adicionais",
  },
  confirmationPolicy: "required",
  alwaysRiskCopy: [
    "A peça-base 1:1 já conta no pacote.",
    "Cobrança definitiva: não há estorno, inclusive se uma geração falhar.",
  ],
};

export const PACKAGE_CHILD_FORMATS = PACKAGE_FORMATS;
