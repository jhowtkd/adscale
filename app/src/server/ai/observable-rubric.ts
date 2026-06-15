import { getTargetDimensions } from "@/lib/formats";

export const FORBIDDEN_APPROVAL_TERMS = [
  "polished",
  "professional",
  "premium feel",
  "high quality",
  "well designed",
] as const;

export const OBSERVABLE_DEFECT_NOTE_RULE = `OBSERVABLE DEFECT NOTES (required for every failed/warning criterion):
- Cite VISIBLE evidence: named zones (hook headline, offer card, CTA button), exact text snippets, colors, positions (top-left badge row), or counts (four equal-weight modules).
- Do NOT approve or excuse with vague praise alone: ${FORBIDDEN_APPROVAL_TERMS.map((t) => `"${t}"`).join(", ")} without citing what is wrong.
- A high-production look does NOT override hierarchy overload, missing dominant idea, or illegible hook at thumbnail scale.
- BAD: "Generic visual." / "Looks polished and professional."
- GOOD: "Four equal-weight glass cards in center grid compete with headline; neon cyan glow on CTA pill." / "NR1 card grid dominates frame and crowds headline, CTA, and badge."`;

export const VISUAL_OVERLOAD_RUBRIC = `VISUAL OVERLOAD (fail creativeRisk or briefMatch when ANY apply):
- No single dominant focal point — hook/headline does not clearly win attention.
- More than three information zones compete at similar visual weight (e.g. card grid + badge row + secondary CTA + icon strip).
- Multiple competing CTAs or button-like modules fight the primary hook for attention.
- Mark failed and name the competing zones/modules observed.`;

export const GENERIC_TEMPLATE_RUBRIC = `GENERIC TEMPLATE AESTHETIC (fail creativeRisk when severe AND unjustified):
- Severe AI-template signals: neon glow stacks, holographic grids, glassmorphism cards, excessive lens flares, volumetric CTA pills, "premium tech" gradient stacks.
- Fail when these tropes dominate AND are not justified by the campaign brief, brand kit, or source creative.
- Pass only if tropes are faithful to an existing brand system — state which brand element justifies them.`;

export const CRITERION_MAPPING_HEADER = `CRITERION MAPPING (use existing checklist keys only):
- visual overload → creativeRisk (primary), briefMatch (secondary when zones obscure campaign message)
- generic template aesthetic → creativeRisk
- hook illegible at thumbnail/preview scale → legibility (primary), creativeRisk (secondary)
- observable defect note quality → applies to all criteria`;

const SCORE_VISUAL_QUALITY_CAPS = `SCORE VISUAL QUALITY CAPS:
- visualQuality: penalize below 50 for severe generic template aesthetic or visual overload regardless of polish.
- Do NOT score visualQuality above 70 when hook is illegible at thumbnail scale.
- scoreIssues must cite visible elements (same OBSERVABLE DEFECT NOTE RULE).`;

export type ObservableRubricOptions = {
  generationMode?: string;
  targetFormat?: string;
  dominantIdea?: string | null;
  renderTier?: string;
};

export function buildThumbnailHookRubricLine(targetFormat: string): string {
  const dims = getTargetDimensions(targetFormat, true);
  const dimensionText =
    dims != null ? `${dims.width}×${dims.height}px` : "~25% of full canvas";

  return `THUMBNAIL / PREVIEW SCALE (fail legibility when hook unclear):
- Mentally evaluate at mobile feed thumbnail size (~25% scale; for this format preview ≈ ${dimensionText}).
- Primary hook/headline must remain identifiable (readable or unmistakably dominant visually) at that scale.
- Fail legibility when hook merges into background, shrinks below readable size, or loses to decorative chrome at thumbnail scale.`;
}

function buildCoreRubricLines(options: ObservableRubricOptions): string[] {
  const lines: string[] = [
    "",
    OBSERVABLE_DEFECT_NOTE_RULE,
    "",
    VISUAL_OVERLOAD_RUBRIC,
    "",
    GENERIC_TEMPLATE_RUBRIC,
    "",
    buildThumbnailHookRubricLine(options.targetFormat ?? "1:1"),
    "",
    CRITERION_MAPPING_HEADER,
  ];

  if (options.dominantIdea?.trim()) {
    lines.push(`Dominant idea reference (must remain visually identifiable): ${options.dominantIdea.trim()}`);
  }

  return lines;
}

export function buildObservableQaRubricSection(options: ObservableRubricOptions = {}): string {
  return buildCoreRubricLines(options).join("\n");
}

export function buildObservableScoreRubricSection(options: ObservableRubricOptions = {}): string {
  const lines = [...buildCoreRubricLines(options), "", SCORE_VISUAL_QUALITY_CAPS];
  return lines.join("\n");
}

function indexOfEarliestMarker(
  prompt: string,
  fromIndex: number,
  markers: string[]
): number {
  let end = prompt.length;
  for (const marker of markers) {
    const idx = prompt.indexOf(marker, fromIndex);
    if (idx !== -1 && idx < end) {
      end = idx;
    }
  }
  return end;
}

export function extractObservableRubricSection(prompt: string): string {
  const start = prompt.indexOf("OBSERVABLE DEFECT NOTES");
  if (start === -1) return "";

  const thumbnailStart = prompt.indexOf("THUMBNAIL / PREVIEW SCALE", start);
  const searchFrom = thumbnailStart !== -1 ? thumbnailStart : start;

  const end = indexOfEarliestMarker(prompt, searchFrom + 1, [
    "\n\nCampaign:",
    "\nCREATIVITY LEVEL:",
    "\nSCORE VISUAL QUALITY CAPS:",
    "\nEvaluate the generated ad",
    "\n\nLocale:",
  ]);

  return prompt.slice(start, end).trimEnd();
}

export const OVERLOAD_NOTE_MARKERS =
  /competing (?:zones|modules)|more than three|fourth module|equal visual weight|card grid dominates|no (?:single )?dominant focal/i;

export const GENERIC_TEMPLATE_NOTE_MARKERS =
  /generic (?:premium|tech|template)|neon glow|glassmorphism|holographic|volumetric CTA|premium-tech gradient/i;

export const MISSING_DOMINANT_IDEA_MARKERS =
  /no (?:NR1(?:\s+[\w-]+)*\s+(?:visual\s+)?idea|(?:campaign-specific|dominant) (?:visual )?idea)|no campaign-specific visual idea/i;
