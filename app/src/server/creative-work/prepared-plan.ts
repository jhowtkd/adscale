import {
  quoteCreativeWork,
  resolveCreativeWorkFactPack,
  type CreativeWorkFormat,
  type CreativeWorkInputSnapshot,
  type CreativeWorkIntent,
} from "./contracts";

type Protocol = Exclude<CreativeWorkIntent, "social_post">;
type Preserve = "verified_facts" | "brand_requirements" | "source_content" | "source_visual_identity" | "piece_reference_identity" | "piece_reference_recognizability" | "piece_reference_exact_application" | "piece_reference_required_presence";
type Explore = "composition" | "hierarchy" | "visual_language" | "format_layout" | "new_execution" | "piece_reference_visual_language" | "piece_reference_style_direction";

export type PreparedPlanProjectionV1 = {
  version: 1;
  workId: string;
  preparedRevision: string;
  protocol: Protocol;
  materials: Array<{
    sourceId: string;
    label: string;
    role: "content" | "style" | "both" | "piece_reference" | "original_art";
    category: string | null;
    treatment: "identity_preservation" | "recognizable_preservation" | "exact_application" | "required_presence" | "visual_language" | "style_direction" | null;
  }>;
  preserve: Preserve[];
  explore: Explore[];
  outputs: Array<{ label: string; targetFormat: CreativeWorkFormat; directionId: string | null }>;
  outputCount: number;
  formats: CreativeWorkFormat[];
};

const levelLabels = { conservative: "Conservadora", balanced: "Equilibrada", bold: "Ousada" } as const;
const treatmentKey = {
  identity_preservation: ["preserve", "piece_reference_identity"],
  recognizable_preservation: ["preserve", "piece_reference_recognizability"],
  exact_application: ["preserve", "piece_reference_exact_application"],
  required_presence: ["preserve", "piece_reference_required_presence"],
  visual_language: ["explore", "piece_reference_visual_language"],
  style_direction: ["explore", "piece_reference_style_direction"],
} as const;

function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function validSources(protocol: Protocol, snapshot: CreativeWorkInputSnapshot) {
  if (!Array.isArray(snapshot.sources) || !snapshot.settings || typeof snapshot.request !== "string") return false;
  const sources = snapshot.sources;
  if (protocol === "single") return snapshot.request.trim().length > 0 && sources.length <= 3;
  if (protocol === "variations") return sources.length > 0;
  if (protocol === "format_adaptation") return sources.length === 1;
  return sources.length === 2
    && new Set(sources.map((source) => source.sourceId)).size === 2
    && sources.some((source) => source.usage === "content")
    && sources.some((source) => source.usage === "style")
    && !sources.some((source) => source.usage === "both");
}

export function projectPreparedPlanV1(work: {
  id: string;
  toolKind: CreativeWorkIntent;
  format: CreativeWorkFormat;
  inputSnapshot: CreativeWorkInputSnapshot | null;
  updatedAt: Date;
}): PreparedPlanProjectionV1 | null {
  if (work.toolKind === "social_post" || !work.inputSnapshot || !resolveCreativeWorkFactPack(work.inputSnapshot)) return null;
  const protocol = work.toolKind;
  const snapshot = work.inputSnapshot;
  if (!validSources(protocol, snapshot)) return null;
  const materials = snapshot.sources.map((source) => ({
    sourceId: source.sourceId,
    label: source.label?.trim() || (source.pieceReference ? "Referência" : "Arte"),
    role: protocol === "single" ? "piece_reference" as const : protocol === "format_adaptation" || (protocol === "restyle" && source.usage === "content") ? "original_art" as const : source.usage,
    category: source.pieceReference?.category ?? null,
    treatment: source.pieceReference?.treatment ?? null,
  }));
  const preserve: Preserve[] = ["brand_requirements"];
  const explore: Explore[] = [];
  if (protocol === "single") {
    preserve.unshift("verified_facts");
    for (const source of snapshot.sources) {
      const mapping = source.pieceReference && treatmentKey[source.pieceReference.treatment];
      if (mapping?.[0] === "preserve") preserve.push(mapping[1] as Preserve);
      if (mapping?.[0] === "explore") explore.push(mapping[1] as Explore);
    }
    explore.push("composition", "hierarchy", "new_execution");
  } else if (protocol === "variations") {
    if (snapshot.sources.some((source) => source.usage !== "style")) preserve.push("source_content", "source_visual_identity");
    explore.push("composition", "hierarchy", "visual_language", "new_execution");
  } else if (protocol === "format_adaptation") {
    preserve.push("source_content", "source_visual_identity");
    explore.push("format_layout");
  } else {
    preserve.push("source_content");
    explore.push("visual_language", "composition", "hierarchy");
  }
  const quote = quoteCreativeWork({ intent: protocol, format: work.format, targetFormats: snapshot.settings.targetFormats, directionPool: snapshot.settings.directionPool });
  const outputs = quote.plans.map((plan) => ({
    label: protocol === "single" ? "Peça única" : protocol === "restyle" ? "Novo estilo" : protocol === "format_adaptation" ? plan.targetFormat : plan.directionSnapshot?.label ?? levelLabels[plan.creativeLevel],
    targetFormat: plan.targetFormat,
    directionId: plan.directionId ?? null,
  }));
  return {
    version: 1,
    workId: work.id,
    preparedRevision: work.updatedAt.toISOString(),
    protocol,
    materials,
    preserve: unique(preserve),
    explore: unique(explore),
    outputs,
    outputCount: outputs.length,
    formats: unique(outputs.map((output) => output.targetFormat)),
  };
}
