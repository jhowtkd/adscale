import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { derivations } from "../db/schema";
import { getPresignedDownloadUrl } from "../storage/r2";

export async function getPreviewUrlsForDerivations(
  refs: Array<{ workspaceId: string; derivationId: string }>
): Promise<Map<string, string | null>> {
  if (refs.length === 0) return new Map();

  const derivationIdsByWorkspace = new Map<string, Set<string>>();
  for (const ref of refs) {
    const ids = derivationIdsByWorkspace.get(ref.workspaceId) ?? new Set<string>();
    ids.add(ref.derivationId);
    derivationIdsByWorkspace.set(ref.workspaceId, ids);
  }

  const outputKeyById = new Map<string, string>();
  for (const [workspaceId, derivationIdSet] of derivationIdsByWorkspace) {
    const derivationIds = [...derivationIdSet];
    const rows = await db
      .select({ id: derivations.id, outputKey: derivations.outputKey })
      .from(derivations)
      .where(
        and(eq(derivations.workspaceId, workspaceId), inArray(derivations.id, derivationIds))
      );

    for (const row of rows) {
      if (row.outputKey) {
        outputKeyById.set(row.id, row.outputKey);
      }
    }
  }

  const previewByDerivationId = new Map<string, string | null>();
  await Promise.all(
    refs.map(async (ref) => {
      const outputKey = outputKeyById.get(ref.derivationId);
      previewByDerivationId.set(
        ref.derivationId,
        outputKey ? await getPresignedDownloadUrl(outputKey) : null
      );
    })
  );

  return previewByDerivationId;
}
