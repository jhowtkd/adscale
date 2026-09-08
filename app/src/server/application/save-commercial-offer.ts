import { getCreativeWork } from "@/server/repositories/creative-work";
import { insertCommercialOffer } from "@/server/repositories/commercial-offer";
import { extractCommercialOfferFromFactPack } from "@/server/creative-work/commercial-offer";
import { resolveCreativeWorkFactPack } from "@/server/creative-work/contracts";
import type { BrandCommercialOffer } from "@/server/db/schema";

export type SaveCommercialOfferInput = {
  workspaceId: string;
  workItemId: string;
  validFrom?: string;
  validUntil: string;
};

export type SaveCommercialOfferError =
  | { code: "work_not_found" }
  | { code: "missing_product" }
  | { code: "missing_offer" }
  | { code: "missing_validity" }
  | { code: "invalid_window" }
  | { code: "brand_required" };

export async function saveCommercialOfferFromWork(
  input: SaveCommercialOfferInput,
): Promise<{ ok: true; value: { offer: BrandCommercialOffer } } | { ok: false; error: SaveCommercialOfferError }> {
  const existing = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!existing) return { ok: false, error: { code: "work_not_found" } };

  const factPack = resolveCreativeWorkFactPack(existing.work.inputSnapshot);
  if (!factPack) return { ok: false, error: { code: "missing_offer" } };

  const extracted = extractCommercialOfferFromFactPack({
    factPack,
    originWorkId: existing.work.id,
    validFrom: input.validFrom ?? new Date().toISOString(),
    validUntil: input.validUntil,
    clientProfileId: existing.work.clientProfileId,
  });
  if (!extracted.ok) return { ok: false, error: { code: extracted.error } };

  const offer = await insertCommercialOffer({
    workspaceId: input.workspaceId,
    clientProfileId: existing.work.clientProfileId!,
    document: extracted.document,
  });
  return { ok: true, value: { offer } };
}
