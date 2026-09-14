import { describe, expect, it } from "vitest";

import type { CreativeWorkReferencePlanAsset } from "../creative-work/reference-plan";
import {
  brandPersonSchema,
  peopleCatalogSchema,
  personReferenceSlots,
  resolveBriefingPeople,
  resolvePersonMention,
  secondaryPersonReferenceAssets,
  snapshotPeopleMentionedInText,
  type BrandPerson,
} from "./people";

const person = (overrides: Partial<BrandPerson> = {}): BrandPerson => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Ana",
  aliases: [],
  referenceIds: ["22222222-2222-4222-8222-222222222222"],
  primaryReferenceId: "22222222-2222-4222-8222-222222222222",
  preserve: ["características anatômicas"],
  referenceAdequacy: "confirmed",
  ...overrides,
});

describe("resolvePersonMention", () => {
  it("não escolhe silenciosamente entre homônimos", () => {
    const people = ["p1", "p2"].map((id) => ({
      ...person(),
      id: id === "p1"
        ? "11111111-1111-4111-8111-111111111111"
        : "33333333-3333-4333-8333-333333333333",
      name: "Ana",
    }));
    expect(resolvePersonMention("ana", people)).toEqual({
      kind: "ambiguous",
      ids: ["11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333"],
    });
  });

  it("resolve por alias com normalização pt-BR", () => {
    const people = [person({ name: "Ana Beatriz", aliases: ["Aninha"] })];
    const resolved = resolvePersonMention("  ANINHA ", people);
    expect(resolved).toEqual({ kind: "resolved", person: people[0] });
  });

  it("retorna missing para nome desconhecido sem inferir identidade", () => {
    expect(resolvePersonMention("Desconhecida", [person()])).toEqual({ kind: "missing" });
  });

  it("não confunde pessoas parecidas: exige igualdade normalizada", () => {
    const people = [person({ name: "Ana" })];
    expect(resolvePersonMention("Anastácia", people)).toEqual({ kind: "missing" });
    expect(resolvePersonMention("An", people)).toEqual({ kind: "missing" });
  });
});

describe("brandPersonSchema", () => {
  it("aceita pessoa válida", () => {
    expect(brandPersonSchema.safeParse(person()).success).toBe(true);
  });

  it("rejeita pessoa sem foto", () => {
    expect(
      brandPersonSchema.safeParse(person({ referenceIds: [], primaryReferenceId: "22222222-2222-4222-8222-222222222222" })).success,
    ).toBe(false);
  });

  it("rejeita foto principal fora do conjunto", () => {
    expect(
      brandPersonSchema.safeParse(person({ primaryReferenceId: "44444444-4444-4444-8444-444444444444" })).success,
    ).toBe(false);
  });

  it("rejeita referências duplicadas", () => {
    const ref = "22222222-2222-4222-8222-222222222222";
    expect(
      brandPersonSchema.safeParse(person({ referenceIds: [ref, ref] })).success,
    ).toBe(false);
  });

  it("rejeita ids não-UUID atribuídos fora do servidor", () => {
    expect(brandPersonSchema.safeParse(person({ id: "p1" })).success).toBe(false);
  });
});

describe("peopleCatalogSchema", () => {
  it("rejeita ids de pessoa duplicados", () => {
    const catalog = { version: 1, people: [person(), person()] };
    expect(peopleCatalogSchema.safeParse(catalog).success).toBe(false);
  });

  it("rejeita a mesma foto em duas pessoas sem confirmação explícita", () => {
    const catalog = {
      version: 1,
      people: [
        person(),
        person({ id: "33333333-3333-4333-8333-333333333333", name: "Bia" }),
      ],
    };
    expect(peopleCatalogSchema.safeParse(catalog).success).toBe(false);
  });
});

describe("personReferenceSlots", () => {
  const assets = new Map<string, CreativeWorkReferencePlanAsset>([
    ["22222222-2222-4222-8222-222222222222", { assetKey: "photo", mimeType: "image/jpeg", label: "upload.jpg" }],
  ]);

  it("mantém pessoa como presença obrigatória, não inspiração opcional", () => {
    const slots = personReferenceSlots([person({ preserve: [] })], assets);
    expect(slots[0]).toMatchObject({
      role: "piece_required",
      required: true,
      label: "Ana",
      pieceReference: { category: "person_or_character", treatment: "identity_preservation" },
    });
  });

  it("bloqueia pessoa sem adequação confirmada", () => {
    expect(() =>
      personReferenceSlots([person({ referenceAdequacy: "needs_more_photos" })], assets),
    ).toThrow("person_reference_required");
  });

  it("bloqueia pessoa sem foto acessível", () => {
    expect(() => personReferenceSlots([person()], new Map())).toThrow("person_reference_required");
  });
});

describe("resolveBriefingPeople", () => {
  const catalog = {
    version: 1 as const,
    people: [
      person(),
      person({
        id: "33333333-3333-4333-8333-333333333333",
        name: "Bia",
        aliases: ["Biazinha"],
        referenceIds: ["44444444-4444-4444-8444-444444444444"],
        primaryReferenceId: "44444444-4444-4444-8444-444444444444",
      }),
    ],
  };

  it("resolves explicit IDs and ignores unmatched briefing text", () => {
    const result = resolveBriefingPeople({
      catalog,
      personIds: ["33333333-3333-4333-8333-333333333333"],
      text: "Promoção de matrícula para julho",
    });
    expect(result).toEqual({ ok: true, people: [catalog.people[1]] });
  });

  it("turns a briefing name into a required presence", () => {
    const result = resolveBriefingPeople({
      catalog,
      text: "Arte com a Ana apresentando a oferta",
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.people.map((p) => p.name)).toEqual(["Ana"]);
  });

  it("blocks unknown IDs with catalog options", () => {
    const result = resolveBriefingPeople({
      catalog,
      personIds: ["99999999-9999-4999-8999-999999999999"],
      text: "",
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "person_unknown",
        personId: "99999999-9999-4999-8999-999999999999",
        options: [
          { id: "11111111-1111-4111-8111-111111111111", name: "Ana" },
          { id: "33333333-3333-4333-8333-333333333333", name: "Bia" },
        ],
      },
    });
  });

  it("blocks ambiguous names unless an explicit ID wins", () => {
    const homonyms = {
      version: 1 as const,
      people: [
        person(),
        person({
          id: "33333333-3333-4333-8333-333333333333",
          name: "ana",
          referenceIds: ["44444444-4444-4444-8444-444444444444"],
          primaryReferenceId: "44444444-4444-4444-8444-444444444444",
        }),
      ],
    };
    const blocked = resolveBriefingPeople({ catalog: homonyms, text: "Arte com a Ana" });
    expect(blocked.ok).toBe(false);
    expect(blocked.ok === false && blocked.error.code).toBe("person_ambiguous");
    const explicit = resolveBriefingPeople({
      catalog: homonyms,
      personIds: ["33333333-3333-4333-8333-333333333333"],
      text: "Arte com a Ana",
    });
    expect(explicit.ok).toBe(true);
    expect(explicit.ok && explicit.people.map((p) => p.id)).toEqual(["33333333-3333-4333-8333-333333333333"]);
  });

  it("keeps text-only names out of the presence set", () => {
    const result = resolveBriefingPeople({
      catalog,
      text: "Depoimento da Ana",
      textOnly: ["ana"],
    });
    expect(result).toEqual({ ok: true, people: [] });
  });

  it("blocks unconfirmed people instead of generating silently", () => {
    const pending = {
      version: 1 as const,
      people: [person({ referenceAdequacy: "needs_more_photos" })],
    };
    const result = resolveBriefingPeople({ catalog: pending, text: "Arte com a Ana" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("person_unconfirmed");
  });
});

describe("snapshotPeopleMentionedInText", () => {
  it("matches frozen snapshot people by name with word boundaries", () => {
    const people = [{ name: "Ana" }, { name: "Bia" }];
    expect(snapshotPeopleMentionedInText("Depoimento da Ana", people)).toEqual([{ name: "Ana" }]);
    expect(snapshotPeopleMentionedInText("Texto sem menções", people)).toEqual([]);
    expect(snapshotPeopleMentionedInText("Anabela apresenta", people)).toEqual([]);
  });
});

describe("secondaryPersonReferenceAssets", () => {
  it("retorna fotos secundárias em ordem do catálogo, sem a principal", () => {
    const primary = "22222222-2222-4222-8222-222222222222";
    const second = "55555555-5555-4555-8555-555555555555";
    const third = "66666666-6666-4666-8666-666666666666";
    const p = person({ referenceIds: [primary, second, third], primaryReferenceId: primary });
    const assets = new Map<string, CreativeWorkReferencePlanAsset>([
      [primary, { assetKey: "a", mimeType: "image/jpeg", label: "a" }],
      [second, { assetKey: "b", mimeType: "image/jpeg", label: "b" }],
      [third, { assetKey: "c", mimeType: "image/jpeg", label: "c" }],
    ]);
    expect(secondaryPersonReferenceAssets(p, assets).map((asset) => asset.assetKey)).toEqual(["b", "c"]);
  });

  it("não oferece secundárias sem adequação confirmada", () => {
    const p = person({ referenceAdequacy: "needs_more_photos" });
    expect(secondaryPersonReferenceAssets(p, new Map())).toEqual([]);
  });
});
