import { z } from "zod";
import { env } from "@/server/validation/env";
import { logger } from "@/lib/logger";
import { objectStorage } from "@/server/storage";
import { isE2EControlledProviderEnabled } from "./providers/e2e-controlled-provider";
import type { ImageReference } from "./providers/image-provider";
import { extractOutputText, getOpenAI } from "./utils";

export type CandidateJudgment = {
  ranking: string[];
  invalid: string[];
  reason: string;
  repairInstruction?: string;
};

const candidateJudgmentSchema = z.object({
  ranking: z.array(z.string()).min(1),
  invalid: z.array(z.string()),
  reason: z.string(),
  repairInstruction: z.string().optional().default(""),
});

function truncateReason(reason: string, max = 500): string {
  return reason.length > max ? `${reason.slice(0, max)}…` : reason;
}

export function aggregateCandidateJudgments(
  candidateIds: string[],
  judgments: CandidateJudgment[]
): { winnerId: string; invalidIds: string[]; reason: string; refinementPrompt?: string } {
  if (candidateIds.length === 0 || judgments.length === 0) {
    throw new Error("Candidate selection requires candidates and judgments");
  }

  const invalidIds = candidateIds.filter((id) =>
    judgments.filter((judgment) => judgment.invalid.includes(id)).length > judgments.length / 2
  );
  const eligible = candidateIds.filter((id) => !invalidIds.includes(id));
  if (eligible.length === 0) throw new Error("Every image candidate failed objective integrity");

  const score = (id: string) =>
    judgments.reduce((total, judgment) => {
      const rank = judgment.ranking.indexOf(id);
      return total + (rank === -1 ? candidateIds.length : rank);
    }, 0);
  const sorted = [...eligible].sort((left, right) => {
    const scoreDiff = score(left) - score(right);
    if (scoreDiff !== 0) return scoreDiff;
    // Lexicographic tie-break so partial judgment sets never depend on input order.
    return left.localeCompare(right);
  });

  const repairInstructions = [...new Set(
    judgments
      .map((judgment) => (judgment.repairInstruction ?? "").trim())
      .filter(Boolean)
  )];

  return {
    winnerId: sorted[0],
    invalidIds,
    reason: truncateReason(judgments.map((judgment) => judgment.reason).filter(Boolean).join(" | ")),
    refinementPrompt: repairInstructions[0] || undefined,
  };
}

type SelectableCandidate = {
  routeId: string;
  outputKey?: string;
  buffer?: Buffer;
  mimeType: string;
  imageUrl?: string;
};

type SelectCreativeCandidateInput = {
  candidates: SelectableCandidate[];
  brief: string;
  objective: string | null;
  brandConstraints: string | null;
  targetFormat: string;
  referenceImages: ImageReference[];
};

function candidateImageUrl(candidate: SelectableCandidate): string {
  if (candidate.imageUrl) return candidate.imageUrl;
  if (!candidate.buffer) {
    throw new Error(`Candidate ${candidate.routeId} has neither imageUrl nor buffer`);
  }
  return `data:${candidate.mimeType};base64,${candidate.buffer.toString("base64")}`;
}

async function withFreshCandidateUrls(
  candidates: SelectableCandidate[]
): Promise<SelectableCandidate[]> {
  return Promise.all(
    candidates.map(async (candidate) => {
      if (!candidate.outputKey) return candidate;
      try {
        const imageUrl = await objectStorage.signedDownloadUrl(candidate.outputKey);
        return { ...candidate, imageUrl, buffer: undefined };
      } catch (error) {
        logger.warn({
          event: "image_pipeline_stage",
          stage: "selection_url_refresh",
          status: "failed",
          routeId: candidate.routeId,
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        });
        return candidate;
      }
    })
  );
}

async function judgeCandidates(
  input: SelectCreativeCandidateInput,
  candidates: SelectableCandidate[]
): Promise<CandidateJudgment> {
  const freshCandidates = await withFreshCandidateUrls(candidates);
  const candidateIds = freshCandidates.map((candidate) => candidate.routeId);
  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "high" }
  > = [
    {
      type: "input_text",
      text: `Choose the strongest paid-social creative.
Reject objective errors before aesthetic preference. Rank every candidate ID from best to worst.
Judge dominant idea, brand specificity, gestalt, feed impact, factual integrity, and absence of generic AI-ad tropes.
Do not reward polish without an idea.
repairInstruction may be an empty string when no surgical edit is warranted.

OBJECTIVE: ${input.objective ?? "Not provided"}
TARGET FORMAT: ${input.targetFormat}
BRAND CONSTRAINTS: ${input.brandConstraints ?? "Not provided"}
BRIEF:
${input.brief}

CANDIDATE IDS: ${candidateIds.join(", ")}`,
    },
  ];

  for (const candidate of freshCandidates) {
    content.push(
      { type: "input_text", text: `CANDIDATE ${candidate.routeId}` },
      {
        type: "input_image",
        image_url: candidateImageUrl(candidate),
        detail: "high",
      }
    );
  }
  input.referenceImages.forEach((reference, index) => {
    content.push(
      { type: "input_text", text: `REFERENCE ${index + 1}: ${reference.name}` },
      {
        type: "input_image",
        image_url: `data:${reference.mimeType};base64,${reference.buffer.toString("base64")}`,
        detail: "high",
      }
    );
  });

  const response = await getOpenAI().responses.create(
    {
      model: env.OPENAI_TEXT_MODEL,
      input: [
        {
          role: "system",
          content: "You are an independent creative director. You did not create these candidates.",
        },
        { role: "user", content },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "candidate_judgment",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              ranking: { type: "array", items: { type: "string" } },
              invalid: { type: "array", items: { type: "string" } },
              reason: { type: "string" },
              repairInstruction: { type: "string" },
            },
            required: ["ranking", "invalid", "reason", "repairInstruction"],
          },
        },
      },
    },
    { timeout: 180_000, maxRetries: 0 }
  );
  const raw = extractOutputText(response);
  if (!raw) throw new Error("Empty creative candidate judgment");
  const judgment = candidateJudgmentSchema.parse(JSON.parse(raw));
  if (
    judgment.ranking.length !== candidateIds.length ||
    new Set(judgment.ranking).size !== candidateIds.length ||
    judgment.ranking.some((id) => !candidateIds.includes(id))
  ) {
    throw new Error("Candidate judgment must rank every candidate exactly once");
  }
  return judgment;
}

function deterministicFallback(
  candidates: SelectableCandidate[]
): { winnerIndex: number; invalidRouteIds: string[]; reason: string } {
  // Prefer the lexicographically smallest routeId so the choice is stable and
  // independent of presentation order (never "first array slot wins").
  const sortedIds = [...candidates.map((c) => c.routeId)].sort((a, b) => a.localeCompare(b));
  const winnerId = sortedIds[0];
  const winnerIndex = candidates.findIndex((c) => c.routeId === winnerId);
  logger.warn({
    event: "image_pipeline_stage",
    stage: "selection",
    status: "failed",
    message: "No valid selector judgments; using deterministic routeId fallback",
    winnerId,
  });
  return {
    winnerIndex: winnerIndex >= 0 ? winnerIndex : 0,
    invalidRouteIds: [],
    reason: "deterministic_fallback_by_route_id",
  };
}

export async function selectCreativeCandidate(input: SelectCreativeCandidateInput): Promise<{
  winnerIndex: number;
  invalidRouteIds: string[];
  reason: string;
  refinementPrompt?: string;
}> {
  if (input.candidates.length < 2) {
    return { winnerIndex: 0, invalidRouteIds: [], reason: "Only one candidate succeeded" };
  }
  if (isE2EControlledProviderEnabled()) {
    return {
      winnerIndex: 0,
      invalidRouteIds: [],
      reason: "Deterministic local E2E candidate selection",
    };
  }

  const forwardPromise = judgeCandidates(input, input.candidates);
  const reversePromise = judgeCandidates(input, [...input.candidates].reverse());
  const settled = await Promise.allSettled([forwardPromise, reversePromise]);

  const judgments: CandidateJudgment[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") judgments.push(result.value);
    else {
      logger.warn({
        event: "image_pipeline_stage",
        stage: "selection_judgment",
        status: "failed",
        errorMessage: result.reason instanceof Error ? result.reason.message.slice(0, 500) : String(result.reason).slice(0, 500),
      });
    }
  }

  if (judgments.length === 0) {
    return deterministicFallback(input.candidates);
  }

  if (
    judgments.length >= 2 &&
    settled[0].status === "fulfilled" &&
    settled[1].status === "fulfilled" &&
    settled[0].value.ranking[0] !== settled[1].value.ranking[0]
  ) {
    try {
      const rotated = [...input.candidates.slice(1), input.candidates[0]];
      judgments.push(await judgeCandidates(input, rotated));
    } catch (error) {
      logger.warn({
        event: "image_pipeline_stage",
        stage: "selection_tiebreak",
        status: "failed",
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      });
    }
  }

  const result = aggregateCandidateJudgments(
    input.candidates.map((candidate) => candidate.routeId),
    judgments
  );
  return {
    winnerIndex: input.candidates.findIndex((candidate) => candidate.routeId === result.winnerId),
    invalidRouteIds: result.invalidIds,
    reason: result.reason,
    refinementPrompt: result.refinementPrompt,
  };
}
