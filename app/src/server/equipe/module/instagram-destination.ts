import type { AccountScope, EquipeConnection, EquipeItem, EquipePublicationIntent, EquipeRepositories } from "../data";
import { err, ok, type Result } from "../domain";
import { decryptEquipeIgToken, EquipeIgCryptoError } from "../publishing/crypto";
import { appendEvent, requestNotification, scopeOf, type CommandContext } from "./shared";

export const INSTAGRAM_DESTINATION_CHANGED = "instagram_destination_changed";
export const INSTAGRAM_DESTINATION_MESSAGE =
  "O perfil do Instagram mudou ou não está fixado nesta versão. É necessária uma nova versão e aprovação.";

export async function holdInstagramDestination(
  ctx: CommandContext,
  item: EquipeItem,
  intent: EquipePublicationIntent,
): Promise<void> {
  const scope = scopeOf(ctx);
  await ctx.repos.items.update(scope, item.id, { status: "held" });
  await ctx.repos.intents.update(scope, intent.id, {
    status: "held", lastError: INSTAGRAM_DESTINATION_CHANGED,
  });
  await appendEvent(ctx, {
    eventType: "item.held", objectType: "item", objectId: item.id,
    payload: { reason: INSTAGRAM_DESTINATION_CHANGED, message: INSTAGRAM_DESTINATION_MESSAGE, heldIntentIds: [intent.id] },
  });
  await requestNotification(ctx, {
    recipientRole: "strategist", templateKey: "item.held",
    detail: { itemId: item.id, reasons: [INSTAGRAM_DESTINATION_MESSAGE] },
  });
}

/** Identity comes from the encrypted provider response, never from a client-supplied id. */
export function instagramIdentityOf(connection: EquipeConnection | null) {
  if (!connection || connection.provider !== "instagram") return null;
  try {
    return decryptEquipeIgToken(connection.encryptedToken);
  } catch (error) {
    if (error instanceof EquipeIgCryptoError) return null;
    throw error;
  }
}

export async function resolveInstagramDestination(
  repos: EquipeRepositories,
  scope: AccountScope,
  destination: string,
): Promise<Result<{ destination: string; destinationIgUserId: string | null }>> {
  const unpinned = { destination, destinationIgUserId: null };
  const connection = (await repos.connections.list(scope)).find((row) => row.provider === "instagram");
  if (connection?.status !== "active") return ok(unpinned);
  const identity = instagramIdentityOf(connection);
  if (!identity) return err("invalid_token", "não foi possível identificar o perfil do Instagram conectado");
  // The payload may identify the connected profile; the stored destination
  // always comes from the server credential, never from model-supplied text.
  const target = destination.slice("instagram:".length);
  if (!destination.startsWith("instagram:") || (target !== identity.igUserId &&
      (!identity.igUsername || target.toLowerCase() !== `@${identity.igUsername}`.toLowerCase()))) {
    return err("destination_mismatch", "o destino informado não corresponde ao perfil do Instagram conectado");
  }
  return ok({
    destination: `instagram:${identity.igUsername ? `@${identity.igUsername}` : identity.igUserId}`,
    destinationIgUserId: identity.igUserId,
  });
}
