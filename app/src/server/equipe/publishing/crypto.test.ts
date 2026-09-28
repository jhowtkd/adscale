import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const KEY_B64 = Buffer.alloc(32, 7).toString("base64");
const OTHER_B64 = Buffer.alloc(32, 9).toString("base64");

vi.mock("@/server/validation/env", () => ({
  env: { EQUIPE_IG_TOKEN_ENCRYPTION_KEY: undefined as string | undefined },
}));

import { env } from "@/server/validation/env";
import {
  EquipeIgCryptoError,
  decryptEquipeIgToken,
  encryptEquipeIgToken,
} from "./crypto";

function setKey(value: string | undefined): void {
  (env as { EQUIPE_IG_TOKEN_ENCRYPTION_KEY?: string }).EQUIPE_IG_TOKEN_ENCRYPTION_KEY = value;
}

describe("equipe publishing crypto (AES-GCM v1:)", () => {
  beforeEach(() => {
    setKey(KEY_B64);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("roundtrip preserva token e conta, sem expor o claro", () => {
    const packed = encryptEquipeIgToken({
      accessToken: "ig-token-segredo",
      igUserId: "17841400008460056",
      igUsername: "marca",
    });
    expect(packed.startsWith("v1:")).toBe(true);
    expect(packed).not.toContain("ig-token-segredo");
    expect(decryptEquipeIgToken(packed)).toEqual({
      accessToken: "ig-token-segredo",
      igUserId: "17841400008460056",
      igUsername: "marca",
    });
  });

  it("IV aleatório: duas cifras do mesmo token diferem", () => {
    const payload = { accessToken: "abc", igUserId: "1", igUsername: null };
    expect(encryptEquipeIgToken(payload)).not.toBe(encryptEquipeIgToken(payload));
  });

  it("chave errada não decifra", () => {
    const packed = encryptEquipeIgToken({ accessToken: "abc", igUserId: "1", igUsername: null });
    setKey(OTHER_B64);
    expect(() => decryptEquipeIgToken(packed)).toThrow(EquipeIgCryptoError);
  });

  it("dado adulterado não decifra", () => {
    const packed = encryptEquipeIgToken({ accessToken: "abc", igUserId: "1", igUsername: null });
    const tampered = `${packed.slice(0, -4)}AAAA`;
    expect(() => decryptEquipeIgToken(tampered)).toThrow(EquipeIgCryptoError);
  });

  it("sem chave, cifrar e decifrar falham com erro claro", () => {
    setKey(undefined);
    const payload = { accessToken: "abc", igUserId: "1", igUsername: null };
    expect(() => encryptEquipeIgToken(payload)).toThrow(/EQUIPE_IG_TOKEN_ENCRYPTION_KEY ausente/);
    expect(() => decryptEquipeIgToken("v1:AAAA")).toThrow(/EQUIPE_IG_TOKEN_ENCRYPTION_KEY ausente/);
  });

  it("recusa carga sem conta do Instagram", () => {
    expect(() => encryptEquipeIgToken({ accessToken: "abc", igUserId: "", igUsername: null })).toThrow(
      /conta do Instagram ausente/,
    );
  });
});
