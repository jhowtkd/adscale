export type OlharAxis = "figura" | "gestalt" | "voz" | "convite";

export type FutureOlharVerdict = "pronta" | "quase" | "sem_opiniao" | "confusa";

export const OLHAR_AXES: readonly OlharAxis[] = [
  "figura",
  "gestalt",
  "voz",
  "convite",
] as const;

export const OLHAR_VERDICTS: readonly FutureOlharVerdict[] = [
  "pronta",
  "quase",
  "sem_opiniao",
  "confusa",
] as const;

export interface OlharPrinciple {
  axis: OlharAxis;
  title: string;
  summary: string;
}

export const OLHAR_ADSCALE_PRINCIPLES: readonly OlharPrinciple[] = [
  {
    axis: "figura",
    title: "Dominant idea",
    summary:
      "The eye must know where to land quickly. One dominant visual idea anchors every piece — the scroll-stopping focal point is non-negotiable.",
  },
  {
    axis: "gestalt",
    title: "Gestalt before grouping",
    summary:
      "Judge grouping, axis, scale, figure-ground, rhythm, and silence before counting information groups. Composition is read as a whole, not as stacked widgets.",
  },
  {
    axis: "voz",
    title: "Aesthetic voice",
    summary:
      "Generic AI template aesthetics are creative failures, not polish issues. Brand is felt through presence, rhythm, tone, typography, and color — not only a CRM string.",
  },
  {
    axis: "convite",
    title: "Invite and reading path",
    summary:
      "The call-to-action is invite and hierarchy in the reading path — not a clickable widget. Weight the invite so the eye reaches it naturally after the dominant idea.",
  },
] as const;

const AXIS_LABELS: Record<OlharAxis, string> = {
  figura: "Figura (dominant idea)",
  gestalt: "Gestalt (grouping and rhythm)",
  voz: "Voz (aesthetic voice)",
  convite: "Convite (invite and reading path)",
};

export function summarizeOlharAxis(axis: OlharAxis): string {
  const principle = OLHAR_ADSCALE_PRINCIPLES.find((p) => p.axis === axis);
  if (!principle) {
    return axis;
  }
  return `${AXIS_LABELS[axis]}: ${principle.summary}`;
}

export function buildOlharAdscaleSection(): string[] {
  return [
    "OLHAR ADSCALE (creative judgment — first pass):",
    "- Creative judgment happens in two passes: Olhar (art direction) first, then Exportacao (brand, claims, format, required text, resolution).",
    "- Exportacao and compliance are a second pass. Do not let export checklist language override figure, gestalt, voice, or invite in this generation pass.",
    `- ${summarizeOlharAxis("figura")}`,
    `- ${summarizeOlharAxis("gestalt")}`,
    `- ${summarizeOlharAxis("voz")}`,
    `- ${summarizeOlharAxis("convite")}`,
    "- Medium is the judge: the creative must work at the scale where it will be consumed.",
    "- Human creative judgment remains the calibration source for what feels ready, almost, without opinion, or confused.",
  ];
}
