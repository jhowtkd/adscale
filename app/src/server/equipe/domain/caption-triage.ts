// Caption-edit triage ("Edição de legenda"): what the new text asserts is
// classified by commercial nature, and each nature takes exactly one path.
// Classification itself is done by reviewers/AI; the domain only routes.

export type ClaimNature =
  | "permanent_fact" // Fato permanente do negócio
  | "commercial_condition" // Condição comercial (preço, desconto, frete, brinde, prazo)
  | "regulated_claim" // Alegação regulada ou arriscada
  | "none"; // No factual/commercial assertion

export type TriagePath =
  | "confirm_as_business_fact" // Approver confirms; enters Context as declared
  | "update_catalog_only" // Only via the ADScale catalog (the offer)
  | "block_and_escalate" // Blocked; escalation to quality (not client-confirmable)
  | "revalidate_only"; // Plain revalidation, no commercial path

export type CaptionTriage = {
  path: TriagePath;
  /** The winning nature when several were detected. */
  matched: ClaimNature;
};

const PATH_BY_NATURE: Record<ClaimNature, TriagePath> = {
  permanent_fact: "confirm_as_business_fact",
  commercial_condition: "update_catalog_only",
  regulated_claim: "block_and_escalate",
  none: "revalidate_only",
};

/** Route an edited caption; the most severe detected nature wins. */
export function triageCaptionEdit(natures: ClaimNature[]): CaptionTriage {
  const order: ClaimNature[] = ["regulated_claim", "commercial_condition", "permanent_fact", "none"];
  const detected = new Set(natures);
  for (const nature of order) {
    if (natures.length === 0 && nature === "none") return { path: "revalidate_only", matched: "none" };
    if (detected.has(nature)) return { path: PATH_BY_NATURE[nature], matched: nature };
  }
  return { path: "revalidate_only", matched: "none" };
}
