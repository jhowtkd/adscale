// Live AdscaleGateway for production agent runs (#550).
//
// Read-only lookups over the existing repositories. Scoped to one
// workspace: the gateway methods that take no workspace use the one the
// adapter was built with (the job builds it from the event).

import { getClientProfile } from "@/server/repositories/client-reference";
import { getCreativeWork, getCreativeWorkOutputInWorkspace } from "@/server/repositories/creative-work";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { getCommercialOfferInWorkspace } from "@/server/repositories/commercial-offer";
import type {
  AdscaleAssetRef,
  AdscaleClientProfileRef,
  AdscaleCreativeWorkOutputRef,
  AdscaleCreativeWorkRef,
  AdscaleGateway,
  AdscaleOfferRef,
} from "../module/ports";

export class LiveAdscaleGateway implements AdscaleGateway {
  constructor(private readonly workspaceId: string) {}

  async getClientProfile(
    workspaceId: string,
    clientProfileId: string,
  ): Promise<AdscaleClientProfileRef | null> {
    // The gateway is scoped to one workspace at construction, like every
    // other method here: a mismatched argument refuses without touching
    // the repository, so the gateway can never read another workspace.
    if (workspaceId !== this.workspaceId) return null;
    const profile = await getClientProfile(workspaceId, clientProfileId);
    if (!profile) return null;
    return { id: profile.id, workspaceId: profile.workspaceId };
  }

  async getAsset(assetId: string): Promise<AdscaleAssetRef | null> {
    const asset = await getWorkspaceAssetById(assetId, this.workspaceId);
    if (!asset) return null;
    return { id: asset.id, workspaceId: asset.workspaceId, kind: asset.type };
  }

  async getCreativeWork(workId: string): Promise<AdscaleCreativeWorkRef | null> {
    const found = await getCreativeWork(this.workspaceId, workId);
    if (!found) return null;
    return { id: found.work.id, workspaceId: found.work.workspaceId };
  }

  async getCreativeWorkOutput(outputId: string): Promise<AdscaleCreativeWorkOutputRef | null> {
    const found = await getCreativeWorkOutputInWorkspace(this.workspaceId, outputId);
    if (!found) return null;
    return { id: found.id, workspaceId: found.workspaceId, workId: found.workItemId };
  }

  async getOffer(offerId: string): Promise<AdscaleOfferRef | null> {
    const offer = await getCommercialOfferInWorkspace(this.workspaceId, offerId);
    if (!offer) return null;
    return { id: offer.id, workspaceId: offer.workspaceId };
  }
}
