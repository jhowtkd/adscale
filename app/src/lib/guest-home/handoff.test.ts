import { describe, expect, it } from "vitest";
import { parseGuestHandoff } from "./handoff";

const id = "aa111111-1111-4111-8111-111111111111";

describe("parseGuestHandoff", () => {
  it("identifica um pedido público isolado", () => {
    expect(parseGuestHandoff({ guestDraft: id })).toEqual({ kind: "guest", id });
  });

  it("não aplica pedido público sobre um trabalho aberto", () => {
    expect(parseGuestHandoff({ guestDraft: id, workId: id })).toEqual({
      kind: "conflict",
      id,
    });
  });

  it("trata template ou campanha abertos como conflito", () => {
    expect(parseGuestHandoff({ guestDraft: id, templateId: id })).toEqual({
      kind: "conflict",
      id,
    });
    expect(parseGuestHandoff({ guestDraft: id, campaignId: id })).toEqual({
      kind: "conflict",
      id,
    });
  });

  it("não aceita parâmetros repetidos", () => {
    expect(parseGuestHandoff({ guestDraft: [id, id] })).toEqual({
      kind: "invalid",
    });
  });

  it("rejeita UUID malformado sem aplicar dado", () => {
    expect(parseGuestHandoff({ guestDraft: "../../etc" })).toEqual({
      kind: "invalid",
    });
    expect(parseGuestHandoff({ guestDraft: "" })).toEqual({ kind: "invalid" });
  });

  it("não muda entradas normais do Estúdio", () => {
    expect(parseGuestHandoff({ intent: "single" })).toEqual({ kind: "none" });
    expect(parseGuestHandoff({})).toEqual({ kind: "none" });
    expect(parseGuestHandoff({ workId: id })).toEqual({ kind: "none" });
  });

  it("nunca aceita identidade de workspace ou marca pela URL", () => {
    expect(
      parseGuestHandoff({ guestDraft: id, workspaceId: "ws-1" }),
    ).toEqual({ kind: "guest", id });
  });
});
