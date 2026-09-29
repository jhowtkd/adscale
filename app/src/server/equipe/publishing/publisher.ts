// Instagram Publisher behind the module's Publisher port (#548): the only
// external write of the pilot. Two steps (create container, then publish);
// the module persists the container id between them, so a retry reuses the
// stored container and never creates another. Auth and media URLs are
// injected — this file only speaks to the Graph through the injected fetch.

import {
  PUBLISHER_CONNECTION_EXPIRED,
  PUBLISHER_CONNECTION_REVOKED,
  PublisherFailedError,
  PublisherUncertainError,
  type CreateContainerInput,
  type DeleteMediaInput,
  type PublishContainerInput,
  type Publisher,
  type RecentMedia,
  type RecentMediaInput,
} from "../module/ports";
import { InstagramAuthError } from "./auth";
import { INSTAGRAM_DESTINATION_CHANGED, INSTAGRAM_DESTINATION_MESSAGE } from "../module/instagram-destination";
import {
  InstagramGraphClient,
  InstagramGraphError,
  type InstagramGraphFetch,
} from "./graph";

export type InstagramPublisherAuth = {
  accessToken: string;
  igUserId: string;
};

export type InstagramPublisherDeps = {
  fetchFn?: InstagramGraphFetch;
  /** Load the account connection auth (token + IG user id). */
  loadAuth: (input: { workspaceId: string; accountId: string }) => Promise<InstagramPublisherAuth>;
  /**
   * Resolve a media ref (creative-work output id) to the public image URL
   * the container step sends to Instagram. Wired by the dispatch job
   * setup; tests inject a stub.
   */
  resolveMediaUrl: (mediaRef: string) => Promise<string>;
};

/**
 * Map a definitive Meta refusal to a publisher failure code. Best-effort:
 * OAuth code 190 / HTTP 401 mean the token died (expired); a permission
 * refusal on a live token means the grant was pulled (revoked). The exact
 * subcodes get revisited with the App Review traffic.
 */
function mapMetaRefusal(error: InstagramGraphError): string {
  if (error.options.metaCode === 190) return PUBLISHER_CONNECTION_EXPIRED;
  if (error.status === 401) return PUBLISHER_CONNECTION_EXPIRED;
  if (
    error.status === 403 &&
    (error.options.metaCode === 200 || error.options.metaCode === 10)
  ) {
    return PUBLISHER_CONNECTION_REVOKED;
  }
  return "publish_failed";
}

function mapAuthFailure(error: InstagramAuthError): string {
  if (error.code === "connection_expired") return PUBLISHER_CONNECTION_EXPIRED;
  if (error.code === "connection_revoked") return PUBLISHER_CONNECTION_REVOKED;
  return "connection_error";
}

export class InstagramPublisher implements Publisher {
  private readonly client: InstagramGraphClient;
  private readonly loadAuth: InstagramPublisherDeps["loadAuth"];
  private readonly resolveMediaUrl: InstagramPublisherDeps["resolveMediaUrl"];

  constructor(deps: InstagramPublisherDeps) {
    this.client = new InstagramGraphClient({ fetchFn: deps.fetchFn });
    this.loadAuth = deps.loadAuth;
    this.resolveMediaUrl = deps.resolveMediaUrl;
  }

  private async authOf(input: { workspaceId: string; accountId: string; destinationIgUserId?: string | null }, requireDestination = true): Promise<InstagramPublisherAuth> {
    try {
      const auth = await this.loadAuth(input);
      if (requireDestination && (!input.destinationIgUserId || auth.igUserId !== input.destinationIgUserId)) {
        throw new PublisherFailedError(INSTAGRAM_DESTINATION_MESSAGE, INSTAGRAM_DESTINATION_CHANGED);
      }
      return auth;
    } catch (error) {
      if (error instanceof InstagramAuthError) {
        throw new PublisherFailedError(error.message, mapAuthFailure(error));
      }
      throw error;
    }
  }

  private publishFailure(error: unknown): never {
    if (error instanceof PublisherUncertainError || error instanceof PublisherFailedError) {
      throw error;
    }
    if (error instanceof InstagramGraphError) {
      if (error.uncertain) {
        throw new PublisherUncertainError(error.message);
      }
      throw new PublisherFailedError(error.message, mapMetaRefusal(error));
    }
    throw error;
  }

  async createContainer(input: CreateContainerInput): Promise<{ containerId: string }> {
    await this.authOf(input);
    let imageUrl: string;
    try {
      imageUrl = await this.resolveMediaUrl(input.mediaRef);
    } catch (error) {
      throw new PublisherFailedError(
        `mídia ilegível (${error instanceof Error ? error.message : "ref"})`,
        "media_unresolvable",
      );
    }
    // Resolving the URL can take time: reload and compare immediately before the write.
    const auth = await this.authOf(input);
    try {
      return await this.client.createImageContainer(auth.accessToken, auth.igUserId, {
        imageUrl,
        caption: input.caption,
      });
    } catch (error) {
      this.publishFailure(error);
    }
  }

  async publishContainer(
    input: PublishContainerInput,
  ): Promise<{ externalId: string; permalink?: string }> {
    const auth = await this.authOf(input);
    try {
      const { mediaId } = await this.client.publishContainer(
        auth.accessToken,
        auth.igUserId,
        input.containerId,
      );
      // Best-effort: the post is published even when the link is unreadable.
      const permalink = await this.client.getPermalink(auth.accessToken, mediaId);
      return permalink ? { externalId: mediaId, permalink } : { externalId: mediaId };
    } catch (error) {
      this.publishFailure(error);
    }
  }

  /**
   * The known Graph contract does not expose container→media correlation.
   * Listing the pinned account proves ownership, not which send created a
   * post. The module additionally requires a recorded provider media id.
   */
  async findRecentMedia(input: RecentMediaInput): Promise<RecentMedia[]> {
    const auth = await this.authOf(input);
    try {
      const rows = await this.client.listRecentMedia(auth.accessToken, auth.igUserId);
      return rows.map((row) => ({
        externalId: row.id,
        igUserId: auth.igUserId,
        caption: row.caption,
        permalink: row.permalink,
        takenAt: row.timestamp ? new Date(row.timestamp) : null,
      }));
    } catch (error) {
      this.publishFailure(error);
    }
  }

  async deleteMedia(input: DeleteMediaInput): Promise<{ deleted: boolean }> {
    const auth = await this.authOf(input, false);
    try {
      return await this.client.deleteMedia(auth.accessToken, input.externalId);
    } catch (error) {
      this.publishFailure(error);
    }
  }
}
