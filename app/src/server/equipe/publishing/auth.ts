// Instagram auth for the Publisher port (#548): load the account's own
// connection, refuse anything but `active`, and decrypt the token bundle.
// No schema change: the token payload carries the IG account ref.

import type { AccountScope, EquipeRepositories } from "../data";
import { EquipeIgCryptoError, decryptEquipeIgToken } from "./crypto";

export type InstagramAuth = {
  connectionId: string;
  accessToken: string;
  igUserId: string;
  igUsername: string | null;
};

export type InstagramAuthFailureCode =
  | "connection_missing"
  | "connection_expired"
  | "connection_revoked"
  | "connection_error";

export class InstagramAuthError extends Error {
  constructor(
    message: string,
    readonly code: InstagramAuthFailureCode,
  ) {
    super(message);
    this.name = "InstagramAuthError";
  }
}

export async function loadInstagramAuth(
  repos: EquipeRepositories,
  scope: AccountScope,
): Promise<InstagramAuth> {
  const connections = await repos.connections.list(scope);
  const connection = connections.find((row) => row.provider === "instagram");
  if (!connection) {
    throw new InstagramAuthError("nenhuma conexão do Instagram nesta conta", "connection_missing");
  }
  if (connection.status === "expired") {
    throw new InstagramAuthError("a conexão do Instagram expirou", "connection_expired");
  }
  if (connection.status === "revoked") {
    throw new InstagramAuthError("a conexão do Instagram foi revogada", "connection_revoked");
  }
  if (connection.status !== "active") {
    throw new InstagramAuthError("a conexão do Instagram está com erro", "connection_error");
  }
  let payload: { accessToken: string; igUserId: string; igUsername: string | null };
  try {
    payload = decryptEquipeIgToken(connection.encryptedToken);
  } catch (error) {
    if (error instanceof EquipeIgCryptoError) {
      throw new InstagramAuthError(
        `token ilegível (${error.message})`,
        "connection_error",
      );
    }
    throw error;
  }
  return {
    connectionId: connection.id,
    accessToken: payload.accessToken,
    igUserId: payload.igUserId,
    igUsername: payload.igUsername,
  };
}
