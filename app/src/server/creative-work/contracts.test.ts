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
    const updates = migration.match(/UPDATE\s+"adscale_app"\."creative_work_(?:items|outputs)"[\s\S]*?;/g) ?? [];
    expect(updates).toHaveLength(2);

    const assignedColumns = updates.flatMap((update) => {
      const assignments = update.match(/SET\s+([\s\S]*?)(?:\nFROM|\nWHERE|;)/)?.[1] ?? "";
      return [...assignments.matchAll(/"([a-z_]+)"\s*=/g)].map((match) => match[1]);
    });
    expect(assignedColumns).toEqual([
      "title", "request", "settings",
      "target_format", "version_number", "retry_count", "operation_key",
    ]);
    const protectedColumns = [
      "id", "status", "output_key", "cost", "failure_code", "quality", "is_selected",
    ];
    expect(assignedColumns.filter((column) => protectedColumns.includes(column))).toEqual([]);

    expect(migration).toContain('"title" = "brief"->>\'theme\'');
    expect(migration).toContain('"request" = "brief"::text');
    expect(migration).toContain('"settings" = \'{"targetFormats":[]}\'::jsonb');
    expect(migration).toContain('"target_format" = work."format"');
    expect(migration).toContain('"operation_key" = output."creative_level" || \':\' || work."format" || \':1\'');
    expect(migration).toContain('ALTER COLUMN "brief" DROP NOT NULL');
    expect(migration).toContain('CREATE UNIQUE INDEX "creative_work_items_draft_key_uq"');
    expect(migration).toContain('WHERE "draft_key" is not null');
    expect(migration).toContain('CREATE UNIQUE INDEX "creative_work_outputs_plan_uq"');
    expect(migration).toContain('CREATE UNIQUE INDEX "creative_work_outputs_operation_uq"');
    expect(migration).toContain('CONSTRAINT "creative_work_outputs_parent_fk" FOREIGN KEY ("parent_output_id")');
    expect(migration).toContain('CONSTRAINT "creative_work_items_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id")');
    expect(migration).not.toContain('DROP INDEX "adscale_app"."creative_work_outputs_selected_uq"');
    expect(migration).toContain('CONSTRAINT "creative_work_sources_origin_check" CHECK (num_nonnulls("asset_id", "template_id") = 1)');
    expect(migration).toContain('REFERENCES "adscale_app"."workspace_assets"("id") ON DELETE CASCADE');
    expect(migration).toContain('REFERENCES "adscale_app"."campaign_templates"("id") ON DELETE CASCADE');
  });
});
