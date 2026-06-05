export const DERIVATION_FORMATS = ["1:1", "4:5", "9:16"] as const;
export type DerivationFormat = (typeof DERIVATION_FORMATS)[number];
