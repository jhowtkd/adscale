import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCreativeWork } from "@/server/repositories/creative-work";
import { getTrainingReferences } from "@/server/repositories/client-reference";
import { objectStorage } from "@/server/storage";

/**
 * Named-person reference photos for the person-fidelity review (plan 03, T3).
 * Display only: the UI shows these beside the output so the operator can
 * compare before recording the specific human review. Identity authority
 * stays in the frozen snapshot and the approved training references.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; outputId: string }> },
) {
  try {
    const [{ workspace }, { id, outputId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const aggregate = await getCreativeWork(workspace.id, id);
    const output = aggregate?.outputs.find((candidate) => candidate.id === outputId);
    if (!aggregate || !output) return apiError("creativeWorkOutputNotFound", 404);
    const snapshotPeople = aggregate.work.inputSnapshot?.people ?? [];
    if (snapshotPeople.length === 0 || !aggregate.work.clientProfileId) {
      return NextResponse.json({
        people: snapshotPeople.map((person) => ({
          personId: person.personId,
          name: person.name,
          primaryPhotoUrl: null,
          photoUrls: [],
        })),
      });
    }
    const references = await getTrainingReferences(workspace.id, aggregate.work.clientProfileId);
    const assetKeyById = new Map(references.map((reference) => [reference.id, reference.assetKey]));
    return NextResponse.json({
      people: snapshotPeople.map((person) => {
        const photoUrls = person.referenceIds.flatMap((referenceId) => {
          const assetKey = assetKeyById.get(referenceId);
          return assetKey ? [objectStorage.publicUrl(assetKey)] : [];
        });
        const primaryKey = assetKeyById.get(person.primaryReferenceId);
        return {
          personId: person.personId,
          name: person.name,
          primaryPhotoUrl: primaryKey ? objectStorage.publicUrl(primaryKey) : null,
          photoUrls,
        };
      }),
    });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].outputs.[outputId].person-references.GET");
  }
}
