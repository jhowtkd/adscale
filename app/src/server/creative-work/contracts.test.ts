import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CREATIVE_SOURCE_STATUSES,
  CREATIVE_SOURCE_USAGES,
  CREATIVE_WORK_INTENTS,
  createCreativeWorkSchema,
  quoteCreativeWork,
  resolveCreativeWorkStatus,
} from "./contracts";

describe("creative work contracts", () => {
  it("accepts a social post brief with one supported format", () => {
    expect(
      createCreativeWorkSchema.parse({
        clientProfileId: "00000000-0000-4000-8000-000000000001",
        toolKind: "social_post",
        format: "4:5",
        brief: {
          theme: "Novo produto",
          objective: "Gerar interesse",
          audience: "Empreendedores digitais",
          offer: "Teste gratuito",
        },
      }).format,
    ).toBe("4:5");
  });

  it("defaults toolKind to social_post when omitted", () => {
    const parsed = createCreativeWorkSchema.parse({
      clientProfileId: "00000000-0000-4000-8000-000000000001",
      format: "1:1",
      brief: {
        theme: "Tema",
        objective: "Obj",
        audience: "Aud",
        offer: "Oferta",
      },
    });
    expect(parsed.toolKind).toBe("social_post");
  });

  it("resolves partial when at least one output failed and one completed", () => {
    expect(resolveCreativeWorkStatus(["completed", "failed", "completed"])).toBe("partial");
  });

  it("resolves completed only when all three outputs completed", () => {
    expect(resolveCreativeWorkStatus(["completed", "completed", "completed"])).toBe("completed");
  });

  it("publishes the supported intents and source contracts", () => {
    expect(CREATIVE_WORK_INTENTS).toEqual([
      "social_post",
      "variations",
      "single",
      "format_adaptation",
      "restyle",
    ]);
    expect(CREATIVE_SOURCE_USAGES).toEqual(["content", "style", "both"]);
    expect(CREATIVE_SOURCE_STATUSES).toEqual([
      "uploaded",
      "analyzing",
      "ready",
      "failed",
    ]);
  });

  it.each([
    [{ intent: "variations" as const, format: "4:5" as const, targetFormats: [] }, { unitCount: 3, credits: 15 }],
    [{ intent: "single" as const, format: "4:5" as const, targetFormats: [] }, { unitCount: 1, credits: 5 }],
    [{ intent: "format_adaptation" as const, format: "4:5" as const, targetFormats: ["1:1", "9:16"] as const }, { unitCount: 2, credits: 10 }],
  ])("quotes %o", (input, expected) => {
    expect(quoteCreativeWork(input)).toMatchObject(expected);
  });

  it("keeps migration 0075 backward compatible while backfilling new columns", () => {
    const migration = readFileSync("drizzle/0075_frictionless_creative_work.sql", "utf8");
    expect(migration).toContain('"title" = "brief"->>\'theme\'');
    expect(migration).toContain('"target_format" = work."format"');
    expect(migration).toContain('ALTER COLUMN "brief" DROP NOT NULL');
    const updates = migration.match(/UPDATE[\s\S]*?;/g) ?? [];
    expect(updates.join("\n")).not.toMatch(/SET\s+"(?:id|status|output_key|billing_key|is_selected)"/);
  });
});
