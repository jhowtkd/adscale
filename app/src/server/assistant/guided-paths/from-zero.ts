import { getNextStep, type GuidedBriefingAnswers } from "@/server/ai/guided-briefing";
import { FROM_ZERO_MIN_REFERENCES } from "@/lib/guided-flow/types";

export { FROM_ZERO_MIN_REFERENCES };

export function deriveBriefMissingFields(answers: GuidedBriefingAnswers): string[] {
  const next = getNextStep(answers);
  if (!next) {
    return [];
  }
  return [next];
}

export function buildFromZeroPromptAugment(input: {
  currentStep: string;
  slots: Record<string, unknown>;
  referenceIds: string[];
}): string | null {
  if (input.currentStep !== "confirm_plan") {
    return null;
  }

  const brief =
    input.slots.briefSnapshot && typeof input.slots.briefSnapshot === "object"
      ? (input.slots.briefSnapshot as Record<string, unknown>)
      : null;

  const lines = [
    "Guided path: from_zero at confirm_plan.",
    `User selected ${input.referenceIds.length} visual references — treat them as auxiliary visual direction only.`,
    "Propose exactly create_creative_plan before any image generation.",
    "Do not create an empty campaign before plan approval.",
    "Preserve literal CTA, offer and constraints from the brief snapshot.",
  ];

  if (brief) {
    lines.push(
      `Brief snapshot — offer: ${String(brief.offer ?? "n/a")}, audience: ${String(brief.audience ?? "n/a")}, CTA: ${String(brief.ctaVariants ?? "n/a")}.`
    );
  }

  return lines.join("\n");
}
