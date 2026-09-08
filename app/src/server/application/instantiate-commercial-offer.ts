import { deriveCreativeWorkTitle } from "@/server/creative-work/prepare";
import {
  assertOfferActive,
  assertOfferBrand,
  authorizedOfferRequest,
  freezeCommercialOfferSnapshot,
} from "@/server/creative-work/commercial-offer";
import { createCreativeWorkDraft } from "@/server/repositories/creative-work";
import { getCommercialOfferInWorkspace } from "@/server/repositories/commercial-offer";
import type { CreativeWorkItem } from "@/server/db/schema";

export type InstantiateCommercialOfferInput = {
  workspaceId: string;
  userId: string;
  clientProfileId: string;
  draftKey: string;
  offerId: string;
  now?: Date;
};

export type InstantiateCommercialOfferError =
  | { code: "offer_not_found" }
  | { code: "brand_mismatch" }
  | { code: "expired" }
  | { code: "not_yet_valid" }
  | { code: "client_profile_not_found" };

export async function instantiateCommercialOffer(
  input: InstantiateCommercialOfferInput,
): Promise<
  | { ok: true; value: { work: CreativeWorkItem; offerVersion: number } }
  | { ok: false; error: InstantiateCommercialOfferError }
> {
  const stored = await getCommercialOfferInWorkspace(input.workspaceId, input.offerId);
  if (!stored) return { ok: false, error: { code: "offer_not_found" } };

  const brand = assertOfferBrand({
    offerBrandId: stored.clientProfileId,
    requestedBrandId: input.clientProfileId,
  });
  if (!brand.ok) return { ok: false, error: { code: "brand_mismatch" } };

  const active = assertOfferActive(stored.document, input.now ?? new Date());
  if (!active.ok) return { ok: false, error: { code: active.error } };

  const request = authorizedOfferRequest(stored.document);
  const work = await createCreativeWorkDraft({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    createdByUserId: input.userId,
    draftKey: input.draftKey,
    intent: "single",
    title: deriveCreativeWorkTitle(stored.document.product),
    request,
    format: "4:5",
    settings: { targetFormats: ["4:5"] },
    brief: null,
    inputSnapshot: {
      request,
      settings: { targetFormats: ["4:5"] },
      sources: [],
      commercialOffer: freezeCommercialOfferSnapshot({
        offerId: stored.id,
        version: stored.version,
        document: stored.document,
      }),
    },
  });
  if (!work) return { ok: false, error: { code: "client_profile_not_found" } };
  return { ok: true, value: { work, offerVersion: stored.version } };
}
