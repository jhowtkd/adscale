import { buildClientLearningProposals } from "./aggregate";
import type { ClientLearningProposal } from "@/server/db/schema";
import {
  findActiveProposalBySlice,
  insertClientLearningProposal,
} from "@/server/repositories/client-learning-proposal";
import { listEvaluatedCorpusWithEvaluations } from "@/server/repositories/human-quality-corpus";

export interface GenerateAndPersistClientLearningProposalsOptions {
  workspaceId?: string;
  cohort?: string;
}

export async function generateAndPersistClientLearningProposals(
  options: GenerateAndPersistClientLearningProposalsOptions = {}
): Promise<{ generated: number; proposals: ClientLearningProposal[] }> {
  const rows = await listEvaluatedCorpusWithEvaluations({
    workspaceId: options.workspaceId,
    cohort: options.cohort,
  });

  const built = buildClientLearningProposals(rows);
  const proposals: ClientLearningProposal[] = [];

  for (const proposal of built) {
    const existing = await findActiveProposalBySlice(
      proposal.workspaceId,
      proposal.clientProfileId,
      proposal.sliceKey
    );
    if (existing) {
      continue;
    }
    proposals.push(await insertClientLearningProposal(proposal));
  }

  return { generated: proposals.length, proposals };
}
