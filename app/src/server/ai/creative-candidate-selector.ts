import { z } from "zod";
import { env } from "@/server/validation/env";
import type { ImageReference } from "./providers/image-provider";
import { extractOutputText, getOpenAI } from "./utils";

export type CandidateJudgment = {
  ranking: string[];
  invalid: string[];
  reason: string;
  repairInstruction: string;
};

const candidateJudgmentSchema = z.object({
  ranking: z.array(z.string()).min(1),
  invalid: z.array(z.string()),
  reason: z.string(),
  repairInstruction: z.string(),
});

export function aggregateCandidateJudgments(
  candidateIds: string[],
  judgments: CandidateJudgment[]
): { winnerId: string; invalidIds: string[]; reason: string; refinementPrompt: string } {
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
  const firstRanking = judgments[0].ranking;
  eligible.sort((left, right) =>
    score(left) - score(right) || firstRanking.indexOf(left) - firstRanking.indexOf(right)
  );

  return {
    winnerId: eligible[0],
    invalidIds,
    reason: judgments.map((judgment) => judgment.reason).filter(Boolean).join(" | "),
    refinementPrompt: [...new Set(
      judgments.map((judgment) => judgment.repairInstruction.trim()).filter(Boolean)
    )].join("\n"),
  };
}

type SelectCreativeCandidateInput = {
  candidates: Array<{ routeId: string; buffer: Buffer; mimeType: string }>;
  brief: string;
  objective: string | null;
  brandConstraints: string | null;
  targetFormat: string;
  referenceImages: ImageReference[];
};

async function judgeCandidates(
  input: SelectCreativeCandidateInput,
  candidates: SelectCreativeCandidateInput["candidates"]
): Promise<CandidateJudgment> {
  const candidateIds = candidates.map((candidate) => candidate.routeId);
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
repairInstruction must describe one surgical edit to the top-ranked candidate, preserving everything already correct.

OBJECTIVE: ${input.objective ?? "Not provided"}
TARGET FORMAT: ${input.targetFormat}
BRAND CONSTRAINTS: ${input.brandConstraints ?? "Not provided"}
BRIEF:
${input.brief}

CANDIDATE IDS: ${candidateIds.join(", ")}`,
    },
  ];

  for (const candidate of candidates) {
    content.push(
      { type: "input_text", text: `CANDIDATE ${candidate.routeId}` },
      {
        type: "input_image",
        image_url: `data:${candidate.mimeType};base64,${candidate.buffer.toString("base64")}`,
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

export async function selectCreativeCandidate(input: SelectCreativeCandidateInput): Promise<{
  winnerIndex: number;
  invalidRouteIds: string[];
  reason: string;
  refinementPrompt?: string;
}> {
  if (input.candidates.length < 2) {
    return { winnerIndex: 0, invalidRouteIds: [], reason: "Only one candidate succeeded" };
  }

  const forward = await judgeCandidates(input, input.candidates);
  const reverse = await judgeCandidates(input, [...input.candidates].reverse());
  const judgments = [forward, reverse];
  if (forward.ranking[0] !== reverse.ranking[0]) {
    const rotated = [...input.candidates.slice(1), input.candidates[0]];
    judgments.push(await judgeCandidates(input, rotated));
  }

  const result = aggregateCandidateJudgments(
    input.candidates.map((candidate) => candidate.routeId),
    judgments
  );
  return {
    winnerIndex: input.candidates.findIndex((candidate) => candidate.routeId === result.winnerId),
    invalidRouteIds: result.invalidIds,
    reason: result.reason,
    refinementPrompt: result.refinementPrompt || undefined,
  };
}
