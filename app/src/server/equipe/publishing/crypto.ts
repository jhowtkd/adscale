import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/server/validation/env";

/**
 * Instagram token of the Equipe account, at rest (#548). Same AES-256-GCM
 * `v1:` format as the Meta connection (`served-ads/crypto.ts`), with the
 * Equipe's OWN key (`EQUIPE_IG_TOKEN_ENCRYPTION_KEY`, base64 of 32 bytes).
 * No KMS in the pilot; key rotation is out.
 *
 * Format: `v1:<base64(iv 12B || tag 16B || ciphertext)>`, where the
 * plaintext is the JSON token payload (token + Instagram account ref), so
 * no schema change is needed to remember which IG account was connected.
 */

const PREFIX = "v1:";

export class EquipeIgCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EquipeIgCryptoError";
  }
}

export type EquipeIgTokenPayload = {
  accessToken: string;
  igUserId: string;
  igUsername: string | null;
};

function loadKey(): Buffer {
  const raw = env.EQUIPE_IG_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new EquipeIgCryptoError("EQUIPE_IG_TOKEN_ENCRYPTION_KEY ausente");
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new EquipeIgCryptoError("EQUIPE_IG_TOKEN_ENCRYPTION_KEY inválida (base64)");
  }
  if (key.length !== 32) {
    throw new EquipeIgCryptoError("EQUIPE_IG_TOKEN_ENCRYPTION_KEY deve ter 32 bytes em base64");
  }
  return key;
}

export function encryptEquipeIgToken(payload: EquipeIgTokenPayload): string {
  if (!payload.accessToken) throw new EquipeIgCryptoError("token vazio");
  if (!payload.igUserId) throw new EquipeIgCryptoError("conta do Instagram ausente");
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${Buffer.concat([iv, tag, ciphertext]).toString("base64")}`;
}

function parsePayload(plaintext: string): EquipeIgTokenPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    throw new EquipeIgCryptoError("carga do token inválida");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new EquipeIgCryptoError("carga do token inválida");
  }
  const { accessToken, igUserId, igUsername } = parsed as Record<string, unknown>;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new EquipeIgCryptoError("carga do token sem accessToken");
  }
  if (typeof igUserId !== "string" || !igUserId) {
    throw new EquipeIgCryptoError("carga do token sem igUserId");
  }
  return {
    accessToken,
    igUserId,
    igUsername: typeof igUsername === "string" ? igUsername : null,
  };
}

export function decryptEquipeIgToken(packed: string): EquipeIgTokenPayload {
  if (!packed.startsWith(PREFIX)) throw new EquipeIgCryptoError("ciphertext sem prefixo v1");
  const key = loadKey();
  const raw = Buffer.from(packed.slice(PREFIX.length), "base64");
  if (raw.length < 12 + 16 + 1) throw new EquipeIgCryptoError("ciphertext curto");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      "utf8",
    );
    return parsePayload(plaintext);
  } catch (error) {
    if (error instanceof EquipeIgCryptoError) throw error;
    throw new EquipeIgCryptoError("falha ao decifrar (chave errada ou dado adulterado)");
  }
}
