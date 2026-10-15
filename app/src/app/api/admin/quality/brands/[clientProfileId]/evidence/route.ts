import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { buildPerBrandEvidenceReport } from "@/server/brand-taste/calibration-evidence";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { db } from "@/server/db";
import { clientProfiles } from "@/server/db/schema";
import { readLocalBrandTasteEvidence } from "@/server/jobs/local-brand-taste-proposals";
import { listUncategorizedCorrectionNotes } from "@/server/brand-taste/rule-extraction";

const CORRECTION_NOTES_PAGE_SIZE = 50;
import { loadProposalEvidence, getProposalEvidencePieceKey } from "@/server/brand-taste/proposal-evidence";
import { PROPOSAL_EVIDENCE_KINDS } from "@/server/brand-taste/proposal-evidence-types";

const paramsSchema = z.object({
  clientProfileId: z.string().uuid(),
});

const querySchema = z.object({
  proposalKind: z.enum(["rule", "corpus_quality"]).optional(),
  proposalId: z.string().uuid().optional(),
  evidenceKind: z.enum(PROPOSAL_EVIDENCE_KINDS).optional(),
  evidenceId: z.string().uuid().optional(),
  view: z.literal("piece").optional(),
}).superRefine((query, context) => {
  if (Object.keys(query).length && (!query.proposalKind || !query.proposalId)) {
    context.addIssue({ code: "custom", message: "Proposal scope required" });
  }
  if ((query.view || query.evidenceKind || query.evidenceId) && !(query.view && query.evidenceKind && query.evidenceId)) {
    context.addIssue({ code: "custom", message: "Complete evidence reference required" });
  }
});

export async function GET(
  request: Request,
  context: { params: Promise<{ clientProfileId: string }> }
) {
  try {
    await requirePlatformOwner(request);
    const rawParams = await context.params;
    const parsed = paramsSchema.safeParse(rawParams);

    if (!parsed.success) {
      return apiError("validation_error", 400);
    }

    const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) return apiError("validation_error", 400);

    const { clientProfileId } = parsed.data;

    const [profile] = await db
      .select({
        id: clientProfiles.id,
        workspaceId: clientProfiles.workspaceId,
      })
      .from(clientProfiles)
      .where(eq(clientProfiles.id, clientProfileId))
      .limit(1);

    if (!profile) {
      return apiError("not_found", 404);
    }

    if (query.data.proposalKind && query.data.proposalId) {
      const scope = { workspaceId: profile.workspaceId, clientProfileId: profile.id };
      const proposal = await loadProposalEvidence({ ...scope,
        proposalKind: query.data.proposalKind, proposalId: query.data.proposalId });
      if (!proposal) return apiError("not_found", 404);
      if (query.data.view === "piece") {
        const { evidenceKind, evidenceId } = query.data;
        if (!evidenceKind || !evidenceId || !proposal.support.some(ref =>
          ref.kind === evidenceKind && ref.id === evidenceId && ref.availability === "available")) {
          return apiError("not_found", 404);
        }
        const key = await getProposalEvidencePieceKey(scope, { kind: evidenceKind, id: evidenceId });
        if (!key) return apiError("not_found", 404);
        const { objectStorage } = await import("@/server/storage");
        const response = NextResponse.redirect(await objectStorage.signedDownloadUrl(key));
        response.headers.set("Cache-Control", "private, no-store");
        return response;
      }
      return NextResponse.json({ proposal }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const evidence = await readLocalBrandTasteEvidence({
      workspaceId: profile.workspaceId,
      clientProfileId: profile.id,
    }, undefined, { prospective: false });

    const report = buildPerBrandEvidenceReport({
      clientProfileId: profile.id,
      workspaceId: profile.workspaceId,
      signals: evidence.signals,
    });

    // The note history grows with the brand: the console gets the most recent page and the total.
    const notes = listUncategorizedCorrectionNotes(evidence).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return NextResponse.json({ report: { ...report, correctionNotes: notes.slice(0, CORRECTION_NOTES_PAGE_SIZE),
      correctionNotesTotal: notes.length } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleApiError(error, "admin.quality.brands.evidence.GET");
  }
}
