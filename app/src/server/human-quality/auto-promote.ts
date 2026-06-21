import { promoteCorpusCandidateToQueue } from "./candidate-promotion";

export async function autoPromoteCandidate(input: { candidateId: string }) {
  return promoteCorpusCandidateToQueue({
    candidateId: input.candidateId,
    cohort: "baseline",
    autoPromoted: true,
  });
}

export async function captureAndAutoPromote(input: {
  workspaceId: string;
  derivationId: string;
}) {
  const { captureCorpusCandidateFromDerivation } = await import("./candidate-capture");
  const candidate = await captureCorpusCandidateFromDerivation(input);
  if (!candidate) return { candidate: null, promoted: null };

  try {
    const promoted = await autoPromoteCandidate({ candidateId: candidate.id });
    return { candidate, promoted };
  } catch (error) {
    const message = error instanceof Error ? error.message : "promote_failed";
    return { candidate, promoted: null, promoteError: message };
  }
}
