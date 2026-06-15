import manifestIndex from "../../../tests/fixtures/creative-corpus/manifest-index.json";

export type CorpusRenderTier = "preview" | "final";

export type CanonicalCampaignSlug =
  | "smoke"
  | "nova-campanha"
  | "teste-3-nr1"
  | "teste-campanha-nr1";

export type CorpusManifestCanonicalSlug = CanonicalCampaignSlug | "unmapped";

export interface CanonicalCampaignAllowedEntities {
  people: string[];
  brands: string[];
  products: string[];
  claims: string[];
}

export interface CanonicalCampaign {
  slug: CanonicalCampaignSlug;
  displayNames: string[];
  allowedEntities: CanonicalCampaignAllowedEntities;
  typicalModes: Array<"art_variation" | "format_adaptation" | "restyling">;
  typicalFormats: string[];
}

export interface CorpusManifestEntry {
  id: string;
  idPrefix: string;
  fileName: string;
  campaign: string;
  generation_mode: "art_variation" | "format_adaptation" | "restyling";
  format: string;
  is_preview: boolean;
  renderTier: CorpusRenderTier;
  canonicalSlug: CorpusManifestCanonicalSlug;
  auditArchetype: string | null;
}

export const CANONICAL_CAMPAIGNS: Record<CanonicalCampaignSlug, CanonicalCampaign> = {
  smoke: {
    slug: "smoke",
    displayNames: ["Smoke v11.6 CQA-02"],
    allowedEntities: {
      people: [],
      brands: ["ADScale"],
      products: ["Widget Pro"],
      claims: ["Auditoria gratuita", "LGPD"],
    },
    typicalModes: ["art_variation"],
    typicalFormats: ["1:1"],
  },
  "nova-campanha": {
    slug: "nova-campanha",
    displayNames: ["Nova campanha"],
    allowedEntities: {
      people: ["Professores certificados"],
      brands: ["Instituto Educação+"],
      products: ["Curso de capacitação docente"],
      claims: ["Matrículas abertas", "Formação continuada"],
    },
    typicalModes: ["art_variation", "restyling", "format_adaptation"],
    typicalFormats: ["1:1"],
  },
  "teste-3-nr1": {
    slug: "teste-3-nr1",
    displayNames: ["Teste 3", "CENBRAP NR1"],
    allowedEntities: {
      people: [],
      brands: ["CENBRAP"],
      products: ["NR1 compliance toolkit"],
      claims: ["Conformidade NR1", "Checklist de segurança"],
    },
    typicalModes: ["art_variation", "format_adaptation", "restyling"],
    typicalFormats: ["1:1", "9:16", "16:9", "4:5", "1.91:1"],
  },
  "teste-campanha-nr1": {
    slug: "teste-campanha-nr1",
    displayNames: ["Teste campanha", "Master NR1"],
    allowedEntities: {
      people: [],
      brands: ["Master NR1"],
      products: ["NR1 audit cards"],
      claims: ["Auditoria NR1", "Módulos de conformidade"],
    },
    typicalModes: ["art_variation"],
    typicalFormats: ["1:1"],
  },
};

export const CORPUS_MANIFEST_INDEX: CorpusManifestEntry[] =
  manifestIndex as CorpusManifestEntry[];

const MANIFEST_ID_PREFIXES = new Set(
  CORPUS_MANIFEST_INDEX.map((entry) => entry.idPrefix)
);

export function isCorpusRefIdKnown(idPrefix: string): boolean {
  return MANIFEST_ID_PREFIXES.has(idPrefix);
}
