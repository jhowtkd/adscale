import { createHash } from "node:crypto";
import type { HandoffItem, HandoffState } from "../domain/handoff";
import type { EquipeBrandHandoff } from "../data/types";

export function handoffLibraryItems(s: HandoffState): HandoffItem[] {
  const images = s.decisions.images;
  return [s.decisions.identity?.logo, ...[...(s.captured.images ?? []), ...(images?.uploaded ?? [])]
    .filter(item => images?.kept.includes(item.id))].filter((item): item is HandoffItem => Boolean(item?.key));
}

/** An asset may join the brand only if the brand already owns it or it is this handoff's own unbranded provisional upload. */
export function canAdoptHandoffAsset(asset: { clientProfileId?: string | null; metadata?: unknown }, handoff: { id: string; clientProfileId: string }) {
  if (asset.clientProfileId) return asset.clientProfileId === handoff.clientProfileId;
  const metadata = asset.metadata as Record<string, unknown> | null | undefined;
  return metadata?.provisional === true && metadata.handoffId === handoff.id;
}

export function handoffLibraryPages(handoff: EquipeBrandHandoff, s: HandoffState) {
  return (s.captured.publicContent ?? []).filter(item => item.origin === "site").map(item => {
    const digest = createHash("sha256").update(item.id).digest("hex").slice(0, 24);
    return {
      key: `workspaces/${handoff.workspaceId}/handoff/${handoff.id}/${handoff.readingId}/${digest}.md`,
      name: s.decisions.identity?.name.value ?? "Página do site",
      type: "text/markdown", size: Buffer.byteLength(item.value), text: item.value,
      metadata: { kind: "site_page", title: s.decisions.identity?.name.value, originUrl: s.source?.kind === "site" ? s.source.normalized : null, handoffId: handoff.id, readingId: s.readingId, provisional: false },
    };
  });
}

export function handoffAssetMetadata(handoffId: string, item: HandoffItem) {
  return { handoffId, provisional: false,
    ...(item.origin !== "user" ? { originUrl: item.value } : {}),
    ...(item.caption !== undefined ? { caption: item.caption } : {}) };
}

export const handoffAssetSource = (item: HandoffItem) => `brand_${item.origin === "user" ? "upload" : item.origin}`;

export type HandoffLibraryPage = ReturnType<typeof handoffLibraryPages>[number];
