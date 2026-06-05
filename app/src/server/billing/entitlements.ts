export const BETA_AD_CREDIT_COST = 5;
export const BETA_AD_ALLOWANCE = 10;
export const BETA_CREDIT_GRANT_AMOUNT = BETA_AD_CREDIT_COST * BETA_AD_ALLOWANCE;
export const BETA_CREDIT_GRANT_SOURCE = "beta_tester";

export function creditsToRemainingAds(creditBalance: number) {
  if (creditBalance <= 0) return 0;
  return Math.floor(creditBalance / BETA_AD_CREDIT_COST);
}
