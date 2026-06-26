import {
  getNextStep,
  mapGuidedAnswersToCampaignDraft,
  type GuidedBriefingAnswers,
} from "@/server/ai/guided-briefing";
import { FROM_ZERO_MIN_REFERENCES } from "@/lib/guided-flow/types";
import {
  GuidedFlowValidationError,
  getGuidedFlowByThread,
  patchGuidedFlow,
} from "@/server/repositories/guided-flow";

export { FROM_ZERO_MIN_REFERENCES };

function assertFromZeroFlow(flow: Awaited<ReturnType<typeof getGuidedFlowByThread>>) {
  if (!flow) {
    throw new GuidedFlowValidationError("Guided flow not found");
  }
  if (flow.path !== "from_zero") {
    throw new GuidedFlowValidationError("Flow path is not from_zero");
  }
  return flow;
}

export function deriveBriefMissingFields(answers: GuidedBriefingAnswers): string[] {
  const next = getNextStep(answers);
  if (!next) {
    return [];
  }
  return [next];
}

export async function saveFromZeroBrief(input: {
  workspaceId: string;
  threadId: string;
  clientProfileId: string;
  answers: GuidedBriefingAnswers;
}) {
  const flow = assertFromZeroFlow(
    await getGuidedFlowByThread(input.workspaceId, input.threadId)
  );

  if (flow.currentStep !== "collect_brief") {
    throw new GuidedFlowValidationError("Flow is not at collect_brief step");
  }

  const missingFields = deriveBriefMissingFields(input.answers);
  if (missingFields.length > 0) {
    throw new GuidedFlowValidationError(
      `Brief incomplete — missing step: ${missingFields.join(", ")}`
    );
  }

  const briefSnapshot = mapGuidedAnswersToCampaignDraft(input.answers, "pt-BR");

  const guidedFlow = await patchGuidedFlow(
    input.workspaceId,
    input.threadId,
    input.clientProfileId,
    {
      currentStep: "select_references",
      missingFields: [],
      slots: {
        ...((flow.slots ?? {}) as Record<string, unknown>),
        briefAnswers: input.answers,
        briefSnapshot,
      },
    }
  );

  return { guidedFlow, briefSnapshot };
}

export async function saveFromZeroReferences(input: {
  workspaceId: string;
  threadId: string;
  clientProfileId: string;
  referenceIds: string[];
}) {
  const flow = assertFromZeroFlow(
    await getGuidedFlowByThread(input.workspaceId, input.threadId)
  );

  if (flow.currentStep !== "select_references") {
    throw new GuidedFlowValidationError("Flow is not at select_references step");
  }

  const uniqueIds = [...new Set(input.referenceIds.filter(Boolean))];
  if (uniqueIds.length < FROM_ZERO_MIN_REFERENCES) {
    throw new GuidedFlowValidationError(
      `At least ${FROM_ZERO_MIN_REFERENCES} visual references are required`
    );
  }

  const guidedFlow = await patchGuidedFlow(
    input.workspaceId,
    input.threadId,
    input.clientProfileId,
    {
      currentStep: "confirm_plan",
      referenceIds: uniqueIds,
      missingFields: [],
      slots: {
        ...((flow.slots ?? {}) as Record<string, unknown>),
        referenceCount: uniqueIds.length,
        recommendedAction: "creative_plan",
      },
    }
  );

  return { guidedFlow, referenceIds: uniqueIds };
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
    "Propose creative plan action (start_complete_campaign or creative plan contract) before any image generation.",
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
