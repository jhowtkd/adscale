import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { clientProfiles, guidanceSelections, guidanceSelectionPins, user } from "@/server/db/schema";
import { isPlatformOwnerEmail } from "@/server/auth/platform-owner";
import { resolveGuidanceSelection, serializeGuidanceSelection } from "../repositories/guidance-selection";
import { hashGuidanceContent, hashGuidanceSet, LearnedGuidanceError, validateLearnedGuidanceBudget, type EligibleGuidanceRevision } from "./learned-guidance";
import type { NumericGuidanceRef } from "./guidance-selection-types";

export class GuidanceSelectionError extends Error {
  constructor(public readonly code: "forbidden" | "not_found" | "selection_conflict" | "no_previous_selection" | "invalid_reference" | "budget_exceeded" | "invalid_guidance", message: string) {
    super(message); this.name = "GuidanceSelectionError";
  }
}
type SelectionCommand = {
  workspaceId: string; clientProfileId: string; reviewerUserId: string;
  expectedVersion: number;
};
export async function pinGuidanceSelection(input: SelectionCommand & { refs: readonly NumericGuidanceRef[] }) {
  return changeGuidanceSelection({ ...input, action: "pin_selection" });
}
export async function revertGuidanceSelection(input: SelectionCommand) {
  return changeGuidanceSelection({ ...input, action: "revert_selection" });
}
async function changeGuidanceSelection(input: SelectionCommand & (
  { action: "pin_selection"; refs: readonly NumericGuidanceRef[] } | { action: "revert_selection" }
)) {
  return db.transaction(async tx => {
    const [actor] = await tx.select().from(user).where(eq(user.id, input.reviewerUserId)).limit(1);
    if (!actor || !isPlatformOwnerEmail(actor.email)) throw new GuidanceSelectionError("forbidden", "Somente o Dono da plataforma pode fixar ou reverter orientações.");
    const [brand] = await tx.select({ id: clientProfiles.id }).from(clientProfiles).where(and(eq(clientProfiles.id, input.clientProfileId), eq(clientProfiles.workspaceId, input.workspaceId))).limit(1);
    if (!brand) throw new GuidanceSelectionError("not_found", "Marca não encontrada.");
    await tx.insert(guidanceSelections).values({ workspaceId: input.workspaceId, clientProfileId: input.clientProfileId }).onConflictDoNothing();
    const [row] = await tx.select().from(guidanceSelections).where(and(eq(guidanceSelections.workspaceId, input.workspaceId), eq(guidanceSelections.clientProfileId, input.clientProfileId))).for("update");
    if (input.action === "pin_selection" && (new Set(input.refs.map(ref => ref.ruleId)).size !== input.refs.length || input.refs.some(ref => !Number.isInteger(ref.revision) || ref.revision <= 0))) {
      throw new GuidanceSelectionError("invalid_reference", "Escolha uma única revisão numérica por orientação.");
    }
    const [receipt] = await tx.select().from(guidanceSelectionPins).where(and(eq(guidanceSelectionPins.workspaceId, input.workspaceId),
      eq(guidanceSelectionPins.clientProfileId, input.clientProfileId), eq(guidanceSelectionPins.expectedVersion, input.expectedVersion))).limit(1);
    if (receipt && receipt.action === input.action && receipt.result.pinnedBy === actor.id
      && (input.action === "revert_selection" || hashGuidanceSet(receipt.result.refs) === hashGuidanceSet(input.refs))) return receipt.result;
    if (row.version !== input.expectedVersion) throw new GuidanceSelectionError("selection_conflict", "A seleção mudou. Recarregue e confira as revisões antes de fixar ou reverter.");
    if (input.action === "revert_selection" && !row.previousSelection) throw new GuidanceSelectionError("no_previous_selection", "Não há seleção anterior para reverter.");
    const requestedRefs = input.action === "pin_selection" ? input.refs : row.previousSelection!.refs;
    const resolved = (await resolveGuidanceSelection(input, requestedRefs, tx)).filter(({ ref, revision, currentStatus, retired }) =>
      input.action === "pin_selection" || (revision?.status === "approved" && !retired && currentStatus !== "deprecated" && currentStatus !== "rejected"
        && revision.confirmedMetadata?.contentHash === ref.contentHash && hashGuidanceContent(revision.text) === ref.contentHash
        && !!revision.metadataConfirmedBy?.trim() && !!revision.metadataConfirmedAt && Number.isFinite(new Date(revision.metadataConfirmedAt).getTime())));
    const refs = resolved.map(({ ref }) => ref);
    const revisions: EligibleGuidanceRevision[] = resolved.map(({ ref, revision }) => {
      if (!revision || revision.status !== "approved" || !revision.confirmedMetadata || !revision.metadataConfirmedBy || !revision.metadataConfirmedAt || revision.confirmedMetadata.contentHash !== ref.contentHash) {
        throw new GuidanceSelectionError("invalid_reference", "A revisão aprovada e conferida não foi encontrada nesta marca.");
      }
      return { ...ref, text: revision.text, roles: revision.confirmedMetadata.roles, category: revision.confirmedMetadata.category };
    });
    try {
      // A fragment belongs to one role/mode/format. Disjoint contexts do not share its N/K budget.
      for (const { revision } of resolved) {
        const metadata = revision!.confirmedMetadata!;
        for (const role of metadata.roles) for (const mode of metadata.generationModes) for (const format of metadata.formats) {
          const scoped = revisions.filter(candidate => {
            const scope = resolved.find(row => row.ref.ruleId === candidate.ruleId)!.revision!.confirmedMetadata!;
            return scope.roles.includes(role) && scope.generationModes.includes(mode) && scope.formats.includes(format);
          });
          validateLearnedGuidanceBudget({ role, revisions: scoped });
        }
      }
    } catch (error) {
      if (!(error instanceof LearnedGuidanceError)) throw error;
      throw new GuidanceSelectionError(error.code === "budget_exceeded" ? "budget_exceeded" : "invalid_guidance", error.message);
    }
    const previousSelection = { version: row.version, refs: row.refs, pinnedBy: row.pinnedBy, pinnedAt: row.pinnedAt?.toISOString() ?? null };
    const [updated] = await tx.update(guidanceSelections).set({ refs: [...refs].sort((a, b) => a.ruleId.localeCompare(b.ruleId)), version: row.version + 1,
      pinnedBy: actor.id, pinnedAt: new Date(), previousSelection }).where(eq(guidanceSelections.clientProfileId, input.clientProfileId)).returning();
    const result = serializeGuidanceSelection(updated);
    await tx.insert(guidanceSelectionPins).values({ workspaceId: input.workspaceId, clientProfileId: input.clientProfileId, expectedVersion: input.expectedVersion, action: input.action, result });
    return result;
  });
}
