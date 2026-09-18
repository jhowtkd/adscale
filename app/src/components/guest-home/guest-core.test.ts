import { describe, expect, it } from "vitest";
import {
  DRAFT_TTL,
  MAX_FILE_BYTES,
  buildResumePath,
  createDraft,
  escapeHtml,
  getExample,
  newDraftId,
  parseDraft,
  selectFiles,
  UUID_PATTERN,
  validateRequest,
} from "./guest-core.mjs";

const NOW = 1789680000000;
const ID = "a216280c-2a0c-43dd-8eae-032203bf99cc";

const realFile = (
  name = "referencia.png",
  type = "image/png",
  size = 500,
): File => {
  const file = new File([new Uint8Array(size)], name, {
    type,
    lastModified: 1,
  });
  return file;
};

describe("guest-core (ported from package + task 3)", () => {
  it("rejects blank requests and requests over 4000 characters", () => {
    expect(validateRequest("  ")).toBeTruthy();
    expect(validateRequest("a".repeat(4001))).toBeTruthy();
    expect(validateRequest("Criar um anúncio de lançamento.")).toBeNull();
  });

  it("attachments accept PNG, JPEG and WebP only; enforce 10MB and three files", () => {
    const result = selectFiles(
      [],
      [
        realFile(),
        realFile("vetor.svg", "image/svg+xml"),
        realFile("grande.jpg", "image/jpeg", MAX_FILE_BYTES + 1),
      ],
    );
    expect(result.files).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
    expect(
      selectFiles([realFile("a.png"), realFile("b.png")], [
        realFile("c.png"),
        realFile("d.png"),
      ]).files,
    ).toHaveLength(3);
  });

  it("duplicate files are not appended", () => {
    expect(selectFiles([realFile()], [realFile()]).files).toHaveLength(1);
  });

  it("draft preserves the request, intent and example, with a 24h expiry", () => {
    const draft = createDraft(
      {
        request: "  Minha criação  ",
        intent: "single",
        exampleId: "product",
        files: [],
      },
      ID,
      NOW,
    );
    expect(draft.request).toBe("Minha criação");
    expect(draft.expiresAt).toBe(NOW + DRAFT_TTL);
    expect(parseDraft(draft, NOW)?.exampleId).toBe("product");
  });

  it("invalid, tampered, future or expired drafts are rejected", () => {
    const draft = createDraft(
      { request: "Meu pedido", intent: "single", files: [] },
      ID,
      NOW,
    );
    for (const bad of [
      null,
      {},
      { ...draft, intent: "admin" },
      { ...draft, id: "../../" },
      { ...draft, version: 2 },
      { ...draft, expiresAt: NOW - 1 },
      { ...draft, createdAt: NOW + 600000 },
    ]) {
      expect(parseDraft(bad, NOW)).toBeNull();
    }
  });

  it("resume query includes only opaque identifier, intent and explicit fresh entry", () => {
    const path = buildResumePath(ID, "single");
    expect(path.startsWith("/?")).toBe(true);
    const query = new URL(path, "https://example.com").searchParams;
    expect(query.get("guestDraft")).toBe(ID);
    expect(query.get("intent")).toBe("single");
    expect(query.get("compose")).toBe("1");
    expect(query.get("fresh")).toBe("1");
    expect(query.has("request")).toBe(false);
    expect(() => buildResumePath("//attacker.test", "single")).toThrow();
  });

  it("transporta somente identidade de retomada na URL", () => {
    const draft = createDraft(
      { request: "Mensagem privada de lançamento", intent: "single", files: [] },
      "aa111111-1111-4111-8111-111111111111",
      NOW,
    );
    const path = buildResumePath(draft.id, draft.intent);
    expect(path).not.toContain("Mensagem");
    expect(
      new URL(path, "https://app.example").searchParams.get("guestDraft"),
    ).toBe(draft.id);
  });

  it("examples are curated and unknown identifiers return null", () => {
    expect(getExample("product")?.intent).toBe("single");
    expect(getExample("not-found")).toBeNull();
  });

  it("rejects malformed file sizes in persisted drafts", () => {
    const draft = createDraft(
      { request: "Meu pedido", intent: "single", files: [] },
      ID,
      NOW,
    );
    for (const size of [NaN, Infinity, "500", undefined]) {
      expect(
        parseDraft(
          { ...draft, files: [{ ...realFile("x.png"), size }] },
          NOW,
        ),
      ).toBeNull();
    }
  });

  it("não aceita uma referência feita apenas de metadados", () => {
    const draft = createDraft(
      { request: "Uma peça", intent: "single", files: [] },
      "aa111111-1111-4111-8111-111111111111",
      NOW,
    );
    expect(
      parseDraft(
        {
          ...draft,
          files: [
            {
              name: "imagem.png",
              type: "image/png",
              size: 32,
              lastModified: NOW,
            },
          ],
        },
        NOW,
      ),
    ).toBeNull();
  });

  it("accepts real File references and rebuilds File from Blob + metadata", () => {
    const draft = createDraft(
      { request: "Uma peça", intent: "single", files: [] },
      ID,
      NOW,
    );
    const withFile = parseDraft(
      { ...draft, files: [realFile("ok.png")] },
      NOW,
    );
    expect(withFile?.files[0]).toBeInstanceOf(File);
    const blob = new Blob([new Uint8Array(32)], { type: "image/png" });
    const rebuilt = parseDraft(
      {
        ...draft,
        files: [{ data: blob, name: "solta.png", lastModified: NOW }],
      },
      NOW,
    );
    expect(rebuilt?.files[0]).toBeInstanceOf(File);
    expect(rebuilt?.files[0].name).toBe("solta.png");
  });

  it("refuses expired drafts without renewing TTL", () => {
    const draft = createDraft(
      { request: "Meu pedido", intent: "single", files: [] },
      ID,
      NOW,
    );
    expect(parseDraft(draft, NOW + DRAFT_TTL + 1)).toBeNull();
    // Tampering expiresAt forward breaks the createdAt+TTL invariant.
    expect(
      parseDraft(
        { ...draft, expiresAt: NOW + DRAFT_TTL + 60000 },
        NOW + DRAFT_TTL + 1,
      ),
    ).toBeNull();
  });

  it("opaque draft IDs are unique RFC-style UUIDs", () => {
    const ids = Array.from({ length: 100 }, () => newDraftId());
    expect(new Set(ids).size).toBe(100);
    expect(ids.every((id) => UUID_PATTERN.test(id))).toBe(true);
  });

  it("escapes markup before any user content reaches a dialog", () => {
    expect(escapeHtml(`<img title="x" onerror='bad'>&`)).toBe(
      "&lt;img title=&quot;x&quot; onerror=&#39;bad&#39;&gt;&amp;",
    );
  });
});
