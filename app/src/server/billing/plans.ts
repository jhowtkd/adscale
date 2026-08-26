import { PLAN_CREDIT_GRANTS } from "@/lib/billing/credit-units";
import { env } from "@/server/validation/env";

export const billingPlanKeys = ["starter", "growth", "scale"] as const;

export type BillingPlanKey = (typeof billingPlanKeys)[number];

export const planCreditGrants: Record<BillingPlanKey, number> = PLAN_CREDIT_GRANTS;

const priceIdsByPlan: Record<BillingPlanKey, string> = {
  starter: env.STRIPE_STARTER_PRICE_ID,
  growth: env.STRIPE_GROWTH_PRICE_ID,
  scale: env.STRIPE_SCALE_PRICE_ID,
};

export function getStripePriceId(planKey: BillingPlanKey) {
  return priceIdsByPlan[planKey];
}

export function getPlanKeyForStripePriceId(priceId: string) {
  return billingPlanKeys.find((planKey) => priceIdsByPlan[planKey] === priceId) ?? null;
}
