export const FORBIDDEN_APPROVAL_TERMS = [
  "polished",
  "professional",
  "premium feel",
  "high quality",
  "well designed",
] as const;

export const OBSERVABLE_DEFECT_NOTE_RULE = `OBSERVABLE DEFECT NOTES (required for every failed/warning criterion):
- Cite VISIBLE evidence: named zones (hook headline, offer card, invite/call-to-action text), exact text snippets, colors, positions (top-left badge row), or counts (four equal-weight information groups).
- Do NOT approve or excuse with vague praise alone: ${FORBIDDEN_APPROVAL_TERMS.map((t) => `"${t}"`).join(", ")} without citing what is wrong.
- BAD: "Generic visual." / "Looks polished and professional."
- GOOD: "Four equal-weight glass information groups in center grid compete with headline; neon cyan glow on invite pill." / "NR1 competing equal-weight groups dominate frame and crowd headline, invite, and badge."`;

export const ART_DIRECTION_RUBRIC = `ART DIRECTION (ranking guidance):
- Judge composition, typography, rhythm, contrast, visual treatment, and campaign-specific character.
- Evaluate comprehension in the intended format and context; do not apply a universal 25% thumbnail threshold.
- Three zones, whitespace, safe margins, and CTA prominence are optional techniques, not validity rules.
- Cite visible evidence for every observation.`;

export type ObservableRubricOptions = {
  generationMode?: string;
  targetFormat?: string;
  dominantIdea?: string | null;
  renderTier?: string;
};

function buildCoreRubricLines(options: ObservableRubricOptions): string[] {
  const lines: string[] = [
    "",
    OBSERVABLE_DEFECT_NOTE_RULE,
    "",
    ART_DIRECTION_RUBRIC,
  ];

  if (options.dominantIdea?.trim()) {
    lines.push(
      `Dominant idea reference (ranking guidance — compare how clearly it reads): ${options.dominantIdea.trim()}`
    );
  }

  return lines;
}

export function buildObservableQaRubricSection(options: ObservableRubricOptions = {}): string {
  return buildCoreRubricLines(options).join("\n");
}

export function buildObservableScoreRubricSection(options: ObservableRubricOptions = {}): string {
  return buildCoreRubricLines(options).join("\n");
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

  const artDirectionStart = prompt.indexOf("ART DIRECTION (ranking guidance)", start);
  const searchFrom = artDirectionStart !== -1 ? artDirectionStart : start;

  const end = indexOfEarliestMarker(prompt, searchFrom + 1, [
    "\n\nCampaign:",
    "\nCREATIVITY LEVEL:",
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
