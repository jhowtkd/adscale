// Leaf vocabulary of adjustments and their quality classification. Kept free of imports so
// read-only consumers (the admin factual-alert route) do not reach the agents' model client.
export const ROUND_REJECTION_CLASSIFIED_EVENT = "round.rejection_classified";
export const ADJUSTMENT_CATEGORIES = ["fact", "brand", "voice", "visual", "other"] as const;
export const QUALITY_CLASSIFICATIONS = ["fact", "brand", "taste"] as const;
