import "server-only";
import { CLAIM_NATURE_PRIORITY, PATH_BY_NATURE, type ClaimNature, type TriagePath } from "./equipe/domain/caption-triage";

const CLAIM_DEFINITIONS: Record<ClaimNature, string> = {
  permanent_fact: "fato permanente do negócio não autorizado (ex.: horário de funcionamento).",
  commercial_condition: "condição comercial não autorizada (preço, desconto, frete, brinde ou prazo).",
  regulated_claim: "alegação regulada ou arriscada (ex.: promessa ou garantia de resultado).",
  none: "sem nova afirmação factual ou comercial.",
};

const TRIAGE_CONSEQUENCES: Record<TriagePath, string> = {
  confirm_as_business_fact: "confirmação pelo Aprovador como fato do negócio.",
  update_catalog_only: "Item bloqueado; alteração somente pelo catálogo da oferta.",
  block_and_escalate: "Item bloqueado; Escalonamento para qualidade, sem confirmação pelo cliente.",
  revalidate_only: "revalidação sem encaminhamento comercial.",
};

export const NATUREZA_DAS_AFIRMACOES = [
  "Natureza das afirmações (separada da severidade):",
  `Prioridade (a mais grave prevalece): ${CLAIM_NATURE_PRIORITY.join(" > ")}`,
  ...CLAIM_NATURE_PRIORITY.map(nature => `${nature}: ${CLAIM_DEFINITIONS[nature]} Encaminhamento: ${TRIAGE_CONSEQUENCES[PATH_BY_NATURE[nature]]}`),
  "Claims presentes nos fatos autorizados não precisam de nova confirmação.",
].join("\n");

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
  NATUREZA_DAS_AFIRMACOES,
];
