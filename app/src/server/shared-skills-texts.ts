import "server-only";

/** Exact product rules block — never paraphrased into carousel prompts. */
export const CAROUSEL_PRODUCT_RULES = [
  "Write in natural pt-BR. One main idea per slide. Use 5 to 8 slides because the arc needs them, never to fill a quota.",
  "You may cut, condense, reorder, split, merge and rewrite. Explain every change in the changes array.",
  "Never invent a price, number, date, offer, benefit, proof, condition, credential, modality, guarantee, brand, product or service.",
  "If a missing fact prevents a safe deck, return only concrete blocking questions. Unknown stays unknown.",
  "Reject generic phrases that could belong to any brand, inflated claims, empty motivational language, AI meta-language and a blase tone.",
  "The first slide is hook. CTA is optional and never forced.",
].join("\n");

export const CAROUSEL_GENERIC_PHRASES: readonly string[] = [
  "transforme sua vida",
  "mude sua vida",
  "a melhor escolha",
  "solução completa",
  "leve seu negócio ao próximo nível",
  "não fique para trás",
  "resultados incríveis",
  "qualidade garantida",
  "tudo o que você precisa",
];

export const CAROUSEL_BLASE_PHRASES: readonly string[] = [
  "neste post",
  "neste carrossel",
  "neste conteúdo",
  "apresentamos",
  "veja abaixo",
  "confira abaixo",
  "deslize",
  "um post sobre",
];

export const CAROUSEL_EDITORIAL_EXAMPLES = [
  `Examples to avoid (generic phrases): ${CAROUSEL_GENERIC_PHRASES.join("; ")}`,
  `Examples to avoid (AI meta-language or blase tone): ${CAROUSEL_BLASE_PHRASES.join("; ")}`,
].join("\n");

// Register static fragment text here, in fixed order, as skills are extracted.
export const SHARED_SKILL_TEXTS: readonly string[] = [
  CAROUSEL_PRODUCT_RULES,
  CAROUSEL_EDITORIAL_EXAMPLES,
];
