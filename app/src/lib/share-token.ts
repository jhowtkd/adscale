import {
  createShareLink,
  getShareLinkByToken,
  revokeShareLinkForCampaign,
} from "@/server/repositories/share-link";

const SHARE_LINK_TTL_DAYS = 7;

export interface ShareTokenResult {
  token: string;
  shareUrl: string;
  expiresAt: Date;
}

export async function createShareToken(
  campaignId: string,
  workspaceId: string,
  derivationIds: string[]
): Promise<ShareTokenResult> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() + SHARE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000
  );

  await createShareLink({
    token,
    campaignId,
    workspaceId,
    derivationIds,
    expiresAt,
  });

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const shareUrl = `${baseUrl}/share/${token}`;

  return { token, shareUrl, expiresAt };
}

export interface ValidatedShareToken {
  campaignId: string;
  workspaceId: string;
  derivationIds: string[];
  expiresAt: Date;
}

export type ShareTokenResolution =
  | { status: "invalid" | "expired" | "removed" }
  | { status: "valid"; link: ValidatedShareToken };

export async function resolveShareToken(token: string): Promise<ShareTokenResolution> {
  const link = await getShareLinkByToken(token);
  if (!link) return { status: "invalid" };
  if (link.revokedAt) return { status: "removed" };
  if (new Date() > link.expiresAt) return { status: "expired" };

  return {
    status: "valid",
    link: {
      campaignId: link.campaignId,
      workspaceId: link.workspaceId,
      derivationIds: link.derivationIds,
      expiresAt: link.expiresAt,
    },
  };
}

export async function validateShareToken(
  token: string
): Promise<ValidatedShareToken | null> {
  const resolution = await resolveShareToken(token);
  return resolution.status === "valid" ? resolution.link : null;
}

/**
 * Revoke the active share link for a campaign (workspace-scoped). Once
 * revoked, the token immediately fails validation even before expiry.
 * Returns the number of links revoked (0 if none active).
 */
export async function revokeShareToken(
  campaignId: string,
  workspaceId: string
): Promise<number> {
  return revokeShareLinkForCampaign(campaignId, workspaceId);
}
