export const CREDIT_UNIT_VERSION = 2;
export const TRIAL_CREDIT_GRANT = 500;
export const CREDIT_COSTS = {
  creative_plan: 10,
  image_derivation: 50,
  regeneration: 50,
  restyling: 50,
  delivery_package_child: 50,
  landing_page: 100,
  creative_qa: 10,
  copy_generation: 20,
  personaSimulation: 30,
} as const;
export type CreditAction = keyof typeof CREDIT_COSTS;
export const GENERATION_CREDIT_COSTS = {
  singleDerivation: 50,
  creativeWorkOutput: 50,
  triplet: 150,
  creativeWorkTriplet: 150,
  goalPackage: 150,
} as const;
export const PLAN_CREDIT_GRANTS = { starter: 300, growth: 1_200, scale: 3_600 } as const;
