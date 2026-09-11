export type CreativeProductionKind = "output" | "slide" | "derivation";

export type CreativeProductionItem = {
  id: string;
  kind: CreativeProductionKind;
  workId: string | null;
  campaignId: string | null;
  title: string;
  format: string | null;
  previewUrl: string;
  reviewHref: string;
  createdAt: string;
  deckId: string | null;
  position: number | null;
};

export type CreativeProductionPage = {
  production: CreativeProductionItem[];
  nextCursor: string | null;
};
