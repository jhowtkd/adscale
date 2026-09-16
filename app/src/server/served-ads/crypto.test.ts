import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const KEY_B64 = Buffer.alloc(32, 7).toString("base64");
const OTHER_B64 = Buffer.alloc(32, 9).toString("base64");

vi.mock("@/server/validation/env", () => ({
  env: { META_TOKEN_ENCRYPTION_KEY: undefined as string | undefined },
}));

import { env } from "@/server/validation/env";
import { MetaCryptoError, decryptMetaToken, encryptMetaToken } from "./crypto";

describe("served-ads crypto (AES-GCM)", () => {
  beforeEach(() => {
    (env as { META_TOKEN_ENCRYPTION_KEY?: string }).META_TOKEN_ENCRYPTION_KEY = KEY_B64;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("roundtrip preserva o token e nunca expõe o claro", () => {
    const packed = encryptMetaToken("system-user-token-segredo");
    expect(packed.startsWith("v1:")).toBe(true);
    expect(packed).not.toContain("system-user-token-segredo");
    expect(decryptMetaToken(packed)).toBe("system-user-token-segredo");
  });

  it("IV aleatório: duas cifras do mesmo token diferem", () => {
    expect(encryptMetaToken("abc")).not.toBe(encryptMetaToken("abc"));
  });

  it("chave errada não decifra", () => {
    const packed = encryptMetaToken("abc");
    (env as { META_TOKEN_ENCRYPTION_KEY?: string }).META_TOKEN_ENCRYPTION_KEY = OTHER_B64;
    expect(() => decryptMetaToken(packed)).toThrow(MetaCryptoError);
  });

  it("dado adulterado não decifra", () => {
    const packed = encryptMetaToken("abc");
    const tampered = `${packed.slice(0, -4)}AAAA`;
    expect(() => decryptMetaToken(tampered)).toThrow(MetaCryptoError);
  });

  it("sem chave, cifrar e decifrar falham com erro claro", () => {
    (env as { META_TOKEN_ENCRYPTION_KEY?: string }).META_TOKEN_ENCRYPTION_KEY = undefined;
    expect(() => encryptMetaToken("abc")).toThrow(/META_TOKEN_ENCRYPTION_KEY ausente/);
    expect(() => decryptMetaToken("v1:AAAA")).toThrow(/META_TOKEN_ENCRYPTION_KEY ausente/);
  });

  it("chave com tamanho errado falha", () => {
    (env as { META_TOKEN_ENCRYPTION_KEY?: string }).META_TOKEN_ENCRYPTION_KEY =
      Buffer.alloc(16).toString("base64");
    expect(() => encryptMetaToken("abc")).toThrow(/32 bytes/);
  });

  it("ciphertext sem prefixo falha", () => {
    expect(() => decryptMetaToken("claro")).toThrow(/prefixo v1/);
  });
});
