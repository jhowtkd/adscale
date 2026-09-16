import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/server/validation/env";

/**
 * Token da Conexão Meta em repouso (#347). AES-256-GCM; chave em
 * META_TOKEN_ENCRYPTION_KEY (base64 de 32 bytes). Sem KMS nesta spec;
 * rotação de chave = fora.
 *
 * Formato: `v1:<base64(iv 12B || tag 16B || ciphertext)>`.
 */

const PREFIX = "v1:";

export class MetaCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaCryptoError";
  }
}

function loadKey(): Buffer {
  const raw = env.META_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new MetaCryptoError("META_TOKEN_ENCRYPTION_KEY ausente");
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new MetaCryptoError("META_TOKEN_ENCRYPTION_KEY inválida (base64)");
  }
  if (key.length !== 32) {
    throw new MetaCryptoError("META_TOKEN_ENCRYPTION_KEY deve ter 32 bytes em base64");
  }
  return key;
}

export function encryptMetaToken(plaintext: string): string {
  if (!plaintext) throw new MetaCryptoError("token vazio");
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${Buffer.concat([iv, tag, ciphertext]).toString("base64")}`;
}

export function decryptMetaToken(packed: string): string {
  if (!packed.startsWith(PREFIX)) throw new MetaCryptoError("ciphertext sem prefixo v1");
  const key = loadKey();
  const raw = Buffer.from(packed.slice(PREFIX.length), "base64");
  if (raw.length < 12 + 16 + 1) throw new MetaCryptoError("ciphertext curto");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new MetaCryptoError("falha ao decifrar (chave errada ou dado adulterado)");
  }
}
