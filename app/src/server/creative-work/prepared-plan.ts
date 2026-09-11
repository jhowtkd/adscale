import {
  quoteCreativeWork,
  hasCreativeWorkProtocolSourceShape,
  resolveCreativeWorkFactPack,
  type CreativeWorkFormat,
  type CreativeWorkInputSnapshot,
  type CreativeWorkIntent,
} from "./contracts";
import { resolveCarouselPreparedSnapshot } from "./carousel-contracts";

type LegacyProtocol = Exclude<CreativeWorkIntent, "social_post" | "carousel">;
type Preserve = "verified_facts" | "brand_requirements" | "source_content" | "source_visual_identity" | "piece_reference_identity" | "piece_reference_recognizability" | "piece_reference_exact_application" | "piece_reference_required_presence";
type Explore = "composition" | "hierarchy" | "visual_language" | "format_layout" | "new_execution" | "piece_reference_visual_language" | "piece_reference_style_direction";
type PreparedPlanLabelKey =
  | "material.reference"
  | "material.art"
  | "output.singlePiece"
  | "output.newStyle"
  | "output.level.conservative"
  | "output.level.balanced"
  | "output.level.bold";
type PreparedPlanLabel = {
  /** Human-provided source and direction labels stay verbatim. */
  label?: string;
  /** Locale-neutral fallback rendered by the client. */
  labelKey?: PreparedPlanLabelKey;
};

export type LegacyPreparedPlanProjectionV1 = {
  version: 1;
  workId: string;
  preparedRevision: string;
  protocol: LegacyProtocol;
  materials: Array<PreparedPlanLabel & {
    sourceId: string;
    role: "content" | "style" | "both" | "piece_reference" | "original_art";
    category: string | null;
    treatment: "identity_preservation" | "recognizable_preservation" | "exact_application" | "required_presence" | "visual_language" | "style_direction" | null;
  }>;
  preserve: Preserve[];
  explore: Explore[];
  outputs: Array<PreparedPlanLabel & { targetFormat: CreativeWorkFormat; directionId: string | null }>;
  outputCount: number;
  formats: CreativeWorkFormat[];
};

export type CarouselPreparedPlanProjectionV1 = {
  version: 1;
  workId: string;
  preparedRevision: string;
  protocol: "carousel";
  materials: LegacyPreparedPlanProjectionV1["materials"];
  preserve: Preserve[];
  explore: Explore[];
  outputs: Array<PreparedPlanLabel & {
    targetFormat: "4:5" | "1:1";
    directionId: null;
  }>;
  outputCount: number;
  formats: Array<"4:5" | "1:1">;
};

export type PreparedPlanProjectionV1 =
  | LegacyPreparedPlanProjectionV1
  | CarouselPreparedPlanProjectionV1;

const levelLabelKeys = {
  conservative: "output.level.conservative",
  balanced: "output.level.balanced",
  bold: "output.level.bold",
} as const satisfies Record<"conservative" | "balanced" | "bold", PreparedPlanLabelKey>;
const treatmentKey = {
  identity_preservation: ["preserve", "piece_reference_identity"],
  recognizable_preservation: ["preserve", "piece_reference_recognizability"],
  exact_application: ["preserve", "piece_reference_exact_application"],
  required_presence: ["preserve", "piece_reference_required_presence"],
  visual_language: ["explore", "piece_reference_visual_language"],
  style_direction: ["explore", "piece_reference_style_direction"],
} as const;

function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function sourceLabel(source: CreativeWorkInputSnapshot["sources"][number]): PreparedPlanLabel {
  const label = source.label?.trim();
  return label
    ? { label }
    : { labelKey: source.pieceReference ? "material.reference" : "material.art" };
}
function validSources(protocol: LegacyProtocol, snapshot: CreativeWorkInputSnapshot) {
  if (!Array.isArray(snapshot.sources) || !snapshot.settings || typeof snapshot.request !== "string") return false;
  return hasCreativeWorkProtocolSourceShape({ intent: protocol, request: snapshot.request, sources: snapshot.sources });
}

export function projectPreparedPlanV1(work: {
  id: string;
  toolKind: CreativeWorkIntent;
  format: CreativeWorkFormat;
  inputSnapshot: CreativeWorkInputSnapshot | null;
  updatedAt: Date;
}): PreparedPlanProjectionV1 | null {
  if (work.toolKind === "social_post" || !work.inputSnapshot) return null;
  if (work.toolKind === "carousel") {
    // The carousel projection exists only after the deck/visual contract is
    // frozen; it never exposes copy, answers, fact values or contract
    // internals — the raw snapshot stays on the server.
    const carousel = resolveCarouselPreparedSnapshot(work.inputSnapshot);
    if (!carousel) return null;
    const billedSlides = carousel.generationScope === "cover"
      ? carousel.deck.slides.filter((slide) => slide.position === 1)
      : carousel.generationScope === "interiors"
        ? carousel.deck.slides.filter((slide) => slide.position !== 1)
        : carousel.deck.slides;
    const outputs = billedSlides.map((slide) => ({
      label: `Tela ${slide.position}`,
      targetFormat: carousel.deck.format,
      directionId: null,
    }));
    const projection: CarouselPreparedPlanProjectionV1 = {
      version: 1,
      workId: work.id,
      preparedRevision: carousel.preparedRevision,
      protocol: "carousel",
      materials: work.inputSnapshot.sources.map((source) => ({
        sourceId: source.sourceId,
        ...sourceLabel(source),
        role: "style",
        category: source.pieceReference?.category ?? null,
        treatment: source.pieceReference?.treatment ?? null,
      })),
      preserve: ["verified_facts", "brand_requirements"],
      explore: ["composition", "hierarchy", "visual_language"],
      outputs,
      outputCount: outputs.length,
      formats: [carousel.deck.format],
    };
    return projection;
  }
  if (!resolveCreativeWorkFactPack(work.inputSnapshot)) return null;
  const protocol = work.toolKind;
  const snapshot = work.inputSnapshot;
  if (!validSources(protocol, snapshot)) return null;
  const materials = snapshot.sources.map((source) => ({
    sourceId: source.sourceId,
    ...sourceLabel(source),
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
    if (snapshot.sources.some((source) => source.usage === "content" || source.usage === "both")) preserve.push("source_content");
    if (snapshot.sources.some((source) => source.usage === "style" || source.usage === "both")) preserve.push("source_visual_identity");
    explore.push("composition", "hierarchy", "visual_language", "new_execution");
  } else if (protocol === "format_adaptation") {
    preserve.push("source_content", "source_visual_identity");
    explore.push("format_layout");
  } else {
    preserve.push("source_content");
    explore.push("visual_language", "composition", "hierarchy");
  }
  const quote = quoteCreativeWork({ intent: protocol, format: work.format, targetFormats: snapshot.settings.targetFormats, directionPool: snapshot.settings.directionPool });
  const outputs = quote.plans.map((plan) => {
    const outputLabel: PreparedPlanLabel = protocol === "single"
      ? { labelKey: "output.singlePiece" }
      : protocol === "restyle"
        ? { labelKey: "output.newStyle" }
        : protocol === "format_adaptation"
          ? { label: plan.targetFormat }
          : plan.directionSnapshot?.label
            ? { label: plan.directionSnapshot.label }
            : { labelKey: levelLabelKeys[plan.creativeLevel] };
    return { ...outputLabel, targetFormat: plan.targetFormat, directionId: plan.directionId ?? null };
  });
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
